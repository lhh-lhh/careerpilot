const task = process.argv[2] ?? "unspecified";
console.error(
  JSON.stringify({
    status: "not_run",
    task,
    reason:
      "该阶段尚未实现，不应计为验收通过。请查看 docs/development-progress.md。",
  }),
);
process.exitCode = 2;
