export function getEnvar(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`no ${key}`);
  return val;
}

export function getEnvarOpt(key: string): string | undefined {
  const val = process.env[key];
  return val;
}
