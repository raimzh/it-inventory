import nextConfig from "eslint-config-next";

// Next 16 убрал встроенный `next lint` — раньше он сам подхватывал
// eslint-config-next, теперь конфиг нужен явно, в формате flat config
// (eslint 9+ больше не поддерживает .eslintrc).
const config = [
  ...nextConfig,
  { ignores: [".next/**", "node_modules/**"] },
];

export default config;
