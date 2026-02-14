<h1 align="center"><pre>╔╦╗╦═╗╦ ╦  ╔═╗╔═╗
 ║ ╠╦╝╚╦╝══╠═╣╚═╗
 ╩ ╩╚═ ╩   ╩ ╩╚═╝</pre></h1>
<details>
<summary>Table of Contents</summary>

- [Installation](#installation)
- [Usage](#usage)
- [Exception API](#exception-api)
- [Examples](#examples)
  - [Catch abort and throw](#catch-abort-and-throw)
  - [Type-safe custom errors](#type-safe-custom-errors)
  - [Rethrow behavior](#rethrow-behavior)
  - [Catching stdlib exceptions](#catching-stdlib-exceptions)
- [Limitations](#limitations)
- [Debugging](#debugging)
- [Contributing](#contributing)
- [License](#license)
- [Contact](#contact)

</details>

## Installation

```bash
npm install try-as
```

Add the transform to your `asc` build and load it last.

```bash
asc assembly/index.ts --transform try-as/transform
```

Or in `asconfig.json`:

```json
{
  "options": {
    "transform": ["try-as/transform"]
  }
}
```

If you use multiple transforms, keep `try-as/transform` last.

## Usage

`try-as` rewrites `try/catch/finally`, `throw`, `abort`, and selected stdlib throw paths so they can be handled through a consistent `Exception` object.

```ts
import { Exception } from "try-as";

try {
  throw new Error("boom");
} catch (e) {
  const err = e as Exception;
  console.log(err.toString()); // Error: boom
} finally {
  console.log("done");
}
```

## Exception API

```ts
import { Exception, ExceptionType } from "try-as";
```

- `Exception.type: ExceptionType`
- `Exception.toString(): string`
- `Exception.is<T>(): bool`
- `Exception.as<T>(): T`
- `Exception.clone(): Exception`
- `Exception.rethrow(): void`

`ExceptionType`:
- `None`
- `Abort`
- `Throw`
- `Unreachable`

## Examples

### Catch abort and throw

```ts
import { Exception, ExceptionType } from "try-as";

try {
  abort("fatal");
} catch (e) {
  const err = e as Exception;
  if (err.type == ExceptionType.Abort) {
    console.log(err.toString()); // abort: fatal
  }
}
```

### Type-safe custom errors

```ts
import { Exception } from "try-as";

class MyError extends Error {
  constructor(message: string) {
    super(message);
  }
}

try {
  throw new MyError("typed");
} catch (e) {
  const err = e as Exception;
  if (err.is<MyError>()) {
    const typed = err.as<MyError>();
    console.log(typed.message);
  }
}
```

### Rethrow behavior

```ts
import { Exception } from "try-as";

try {
  // risky code
} catch (e) {
  const err = e as Exception;
  if (!err.is<Error>()) {
    err.rethrow();
  }
}
```

### Catching stdlib exceptions

Stdlib exceptions such as missing map keys, empty array pops, out-of-range string access, and malformed URI decode errors are catchable.

```ts
import { Exception } from "try-as";

try {
  new Map<string, string>().get("missing");
} catch (e) {
  const err = e as Exception;
  console.log(err.toString()); // Error: Key does not exist
}
```

## Limitations

- Runtime/internal trap paths are intentionally not rewritten.
- Exceptions from these internals are not catchable by `try-as`:
  - `~lib/rt`
  - `~lib/shared`
  - `~lib/wasi_`
  - `~lib/performance`
- This library handles transformed throw/abort flows, not low-level Wasm traps like out-of-bounds memory faults.

## Debugging

- `DEBUG=1` enables transform diagnostics.
- `WRITE=pathA,pathB` writes transformed source snapshots as `*.tmp.ts`.

Example:

```bash
DEBUG=1 WRITE=./assembly/test.ts,~lib/map asc assembly/test.ts --transform try-as/transform
```

## Contributing

```bash
npm run build:transform
npm test
npm run format
```

## License

This project is distributed under the MIT license.

- [LICENSE](./LICENSE)

## Contact

- Issues: https://github.com/JairusSW/try-as/issues
- Repository: https://github.com/JairusSW/try-as
- Email: [me@jairus.dev](mailto:me@jairus.dev)
- Website: https://jairus.dev
