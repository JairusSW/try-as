export function importedFunction(): void {
  abort("Aborted from importedFunction");
}

export function deepImportedFunction(): void {
  try {
    importedFunction();
  } catch (e) {
    abort("Aborted from deepImportedFunction");
  }
}
