const DEFAULT_E2E_API_PORT = "58001";
const SAFE_E2E_DATABASE_NAME = /^sarthi_e2e_[a-z0-9_]+$/;

export function resolveE2eDatabaseName(
  value = process.env.E2E_MONGODB_DB ?? `sarthi_e2e_auth_${process.env.E2E_API_PORT ?? DEFAULT_E2E_API_PORT}`
) {
  const databaseName = value;
  if (!SAFE_E2E_DATABASE_NAME.test(databaseName) || /prod(?:uction)?/.test(databaseName)) {
    throw new Error(
      `Unsafe E2E database name "${databaseName}". Use a disposable name beginning with "sarthi_e2e_".`
    );
  }
  return databaseName;
}
