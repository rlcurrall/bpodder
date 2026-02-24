const targets: { target: Bun.Build.CompileTarget; name: string }[] = [
  { target: "bun-linux-x64", name: "bpodder-linux-x64" },
  { target: "bun-darwin-arm64", name: "bpodder-darwin-arm64" },
];

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
