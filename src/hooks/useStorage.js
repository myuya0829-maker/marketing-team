// Storage abstraction layer
// Currently uses window.storage (Claude Artifact API)
// Will be replaced with Supabase in Phase 5

export const storeGet = async (k) => {
  try {
    const r = await window.storage.get(k);
    return r ? JSON.parse(r.value) : null;
  } catch {
    return null;
  }
};

export const storeSet = async (k, v) => {
  try {
    await window.storage.set(k, JSON.stringify(v));
  } catch (e) {
    console.error(e);
  }
};

// Migration: try new key, then try each old key in order
// If new key has empty array, still check old keys for real data
export const migrateGet = async (newKey, oldKeys, transform) => {
  const data = await storeGet(newKey);
  // Only trust new key if it actually has items
  if (data && Array.isArray(data) && data.length > 0) return data;

  // If new key is empty or null, check old keys
  if (oldKeys) {
    for (const key of oldKeys) {
      const old = await storeGet(key);
      if (old && Array.isArray(old) && old.length > 0) {
        const migrated = transform ? transform(old) : old;
        await storeSet(newKey, migrated);
        return migrated;
      }
    }
  }

  return data; // return whatever new key had (could be empty array or null)
};
