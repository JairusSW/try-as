try {
  try {
    abort("Abort inside nested try");
  } catch (e) {
    console.log(e.toString());
  }
} catch (e) {
  console.log(e.toString());
}

function abort(message: string): void {
  throw new Error("abort: " + message);
}
