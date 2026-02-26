const allTargets: { platform: string; target: Bun.Build.CompileTarget; name: string }[] = [
  { platform: "linux-x64", target: "bun-linux-x64", name: "bpodder-linux-x64" },
  { platform: "linux-arm64", target: "bun-linux-arm64", name: "bpodder-linux-arm64" },
  { platform: "darwin", target: "bun-darwin-arm64", name: "bpodder-darwin-arm64" },
];

const filter = process.argv[2];
const targets = filter ? allTargets.filter((t) => t.platform === filter) : allTargets;

if (filter && targets.length === 0) {
  console.error(`Unknown platform: ${filter}`);
  console.error(`Available: ${allTargets.map((t) => t.platform).join(", ")}`);
  process.exit(1);
}

for (const { target, name } of targets) {
  console.log(`Building ${name}...`);

  const result = await Bun.build({
    entrypoints: ["./src/index.ts"],
    compile: {
      target,
      outfile: `./dist/${name}`,
    },
    minify: true,
    sourcemap: "linked",
    bytecode: true,
  });

  if (!result.success) {
    console.error(`Build failed for ${name}:`);
    for (const log of result.logs) {
      console.error(log);
    }
    process.exit(1);
  }

  console.log(`  -> dist/${name}`);
}

console.log("Done.");
