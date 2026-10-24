/** Eén envelop voor elke operatie: {ok, op, ...} of {ok:false, op, error}. */
export async function runOp(op: string, fn: () => Promise<Record<string, unknown>>) {
  try {
    const out = await fn();
    console.log(JSON.stringify({ ok: true, op, ...out }, null, 2));
  } catch (e) {
    console.log(JSON.stringify({ ok: false, op, error: (e as Error).message }, null, 2));
    process.exitCode = 1;
  }
}

/** --naam waarde → { naam: waarde }; vlag zonder waarde → true. */
export function args(argv = process.argv.slice(2)) {
  const pos: string[] = [], flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) pos.push(argv[i]);
    else if (argv[i + 1] && !argv[i + 1].startsWith("--")) flags[argv[i].slice(2)] = argv[++i];
    else flags[argv[i].slice(2)] = true;
  }
  return { pos, flags };
}
