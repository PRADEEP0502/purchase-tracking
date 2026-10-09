import { asc } from 'drizzle-orm';
import { db, schema } from '../db/client.js';

/**
 * The structure tree is small (tens to a few thousand rows), so it is loaded whole and
 * walked in memory for paths, descendants and matching.
 */
export interface StructureTree {
  rows: schema.TaskStructure[];
  byId: Map<number, schema.TaskStructure>;
  children: Map<number | null, schema.TaskStructure[]>;
}

export async function loadStructureTree(): Promise<StructureTree> {
  const rows = await db
    .select()
    .from(schema.taskStructures)
    .orderBy(asc(schema.taskStructures.sortOrder), asc(schema.taskStructures.name));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const children = new Map<number | null, schema.TaskStructure[]>();
  for (const r of rows) {
    const list = children.get(r.parentId) ?? [];
    list.push(r);
    children.set(r.parentId, list);
  }
  return { rows, byId, children };
}

/** Root-first chain of structures ending at `id` (empty if unknown). Guards against cycles. */
export function structureChain(tree: StructureTree, id: number | null | undefined): schema.TaskStructure[] {
  const chain: schema.TaskStructure[] = [];
  const seen = new Set<number>();
  let cur = id ? tree.byId.get(id) : undefined;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.unshift(cur);
    cur = cur.parentId ? tree.byId.get(cur.parentId) : undefined;
  }
  return chain;
}

export function structurePath(tree: StructureTree, id: number | null | undefined): string[] {
  return structureChain(tree, id).map((s) => s.name);
}

/** The structure itself plus everything below it. */
export function withDescendants(tree: StructureTree, ids: number[]): number[] {
  const out = new Set<number>();
  const stack = [...ids];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    for (const c of tree.children.get(id) ?? []) stack.push(c.id);
  }
  return [...out];
}

/** Context fields added to every task returned by the API. */
export function structureContext(tree: StructureTree, structureId: number | null) {
  const chain = structureChain(tree, structureId);
  const parent = chain.length > 1 ? chain[chain.length - 2] : null;
  return {
    structurePath: chain.map((s) => s.name),
    parentStructureId: parent?.id ?? null,
    parentStructureName: parent?.name ?? null,
  };
}
