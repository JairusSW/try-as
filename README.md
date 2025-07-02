<h5 align="center">
  <pre>
<span style="font-size: 0.8em;">████████ ██████  ██    ██        █████  ███████ 
   ██    ██   ██  ██  ██        ██   ██ ██      
   ██    ██████    ████   █████ ███████ ███████ 
   ██    ██   ██    ██          ██   ██      ██ 
   ██    ██   ██    ██          ██   ██ ███████ </span>
    AssemblyScript - v0.2.4
  </pre>
</h5>

## 📚 Contents

- [About](#-about)
- [Installation](#-installation)
- [Examples](#-examples)
- [License](#-license)
- [Contact](#-contact)

## 📝 About

This library is an addon for AssemblyScript that brings JavaScript-like exception handling to the language, allowing you to use familiar `try/catch` syntax with a custom state management system. This allows AssemblyScript developers to write more readable, maintainable code, while retaining the performance benefits of WebAssembly.

## 💾 Installation

```bash
npm install try-as
```

Add the `--transform` to your `asc` command (e.g. in package.json)

```bash
--transform try-as/transform
```

Alternatively, add it to your `asconfig.json`

```json
{
  // ...
  "options": { "transform": ["try-as/transform"] }
}
```

**NOTE: Make sure to load `try-as/transform` last!**

If you'd like to see the code that the transform generates, run the build step with `DEBUG=true`

## 🪄 Usage

This library does all the work behind-the-scenes, so you, the developer, can use the classic `try/catch/finally` syntax with no changes!

```js
try {
  abort("Failed to execute!");
  console.log("This should not execute");
} catch (e) {
  console.log("Got an error: " + e.toString());
} finally {
  console.log("Gracefully shutting down...");
  process.exit(0);
}
```

## 🔍 Examples

### ✅ Type-safe Error Handling

```js
import { JSON } from "json-as";
import { Exception, ExceptionType } from "try-as";

try {
  // something dangerous
} catch (e) {
  const err = e as Exception; // Notice we cast to Exception
  if (err.type == ExceptionType.Throw) {
    console.log("Throw: " + err.toString());
  } else if (err.type == ExceptionType.Abort) {
    console.log("Abort: " + err.toString());
  } else if (err.type == ExceptionType.Unreachable) {
    console.log("Unreachable: " + err.toString());
  }
}
```

### ⚠️ Working with Custom Errors

```typescript
import { Exception } from "try-as";

class MyError extends Error {
  constructor(message: string) {
    super(message);
  }
}

try {
  throw new MyError("This is my custom error!");
} catch (e) {
  const err = e as Exception;

  if (err.is<MyError>()) {
    console.log("Caught MyError: " + err.as<MyError>().message);
  } else {
    console.log("Unknown error type");
  }
}
```

### 🔁 Re-throwing Errors

Sometimes, you want to catch a certain kind of error, handle it, and re-throw it if needed:

```typescript
try {
  // something dangerous
} catch (e) {
  const err = e as Exception;

  if (!err.is<MyError>()) {
    console.log("Rethrowing error: " + err.toString());
    err.rethrow();
    // or
    throw err;
  }

  console.log("Got MyError, but handled it gracefully");
}
```

## 📃 License

This project is distributed under an open source license. You can view the full license using the following link: [License](./LICENSE)

## 📫 Contact

Please send all issues to [GitHub Issues](https://github.com/JairusSW/as-json/issues) and to converse, please send me an email at [me@jairus.dev](mailto:me@jairus.dev)

- **Email:** Send me inquiries, questions, or requests at [me@jairus.dev](mailto:me@jairus.dev)
- **GitHub:** Visit the official GitHub repository [Here](https://github.com/JairusSW/as-json)
- **Website:** Visit my official website at [jairus.dev](https://jairus.dev/)
- **Discord:** Converse with me on [My Discord](https://discord.com/users/600700584038760448) or on the [AssemblyScript Discord Server](https://discord.gg/assemblyscript/)
