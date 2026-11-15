const [first] = process.argv.slice(2);
const label = first ?? "none";
process.stdout.write(`${label}\n`);
