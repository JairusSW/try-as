import { JSON } from "json-as/assembly/index";
// import { JSON } from "./foo";
// function parse<T>(s: string): T {
//   if (isNullable<T>())bar();
//   throw new Error("not implemented");
// }

// function bar(): void {
//   abort("Aborted from bar");
// }
@json
class Vec3 {
  x: f32 = 0.0;
  y: f32 = 0.0;
  z: f32 = 0.0;
}

try {
  JSON.parse<Map<StaticArray<i32>, string>>('ads');
} catch (e) {
  console.log("Caught an Error: " + e.toString());
} finally {
  console.log("Finally.");
}
