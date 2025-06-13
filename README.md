<h5 align="center">
  <pre>
<span style="font-size: 0.8em;">████████ ██████  ██    ██        █████  ███████ 
   ██    ██   ██  ██  ██        ██   ██ ██      
   ██    ██████    ████   █████ ███████ ███████ 
   ██    ██   ██    ██          ██   ██      ██ 
   ██    ██   ██    ██          ██   ██ ███████ </span>
    AssemblyScript - v0.1.3-preview.3
  </pre>
</h5>

## 📚 Contents

- [About](#-about)
- [Installation](#-installation)
- [Usage](#-usage)
- [License](#-license)
- [Contact](#-contact)

## 📝 About

This library is an addon for AssemblyScript that brings JavaScript-like exception handling to the language, allowing you to use familiar `try/catch` syntax with a custom state management system. This allows AssemblyScript developers to write more readable, maintainable code, while retaining the performance benefits of WebAssembly.

## 🚨 Early Development

The exception handling is in the early stages of development. Its not recommended to use this library in production yet, but please, by all means, use it and if you find an issue, help improve it!

## 💾 Installation

```bash
npm install try-as@preview
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

If you'd like to see the code that the transform generates, run the build step with `DEBUG=true`

## 🪄 Usage

This library does all the work behind-the-scenes, so you, the developer, can use the classic `try/catch/finally` syntax with no changes!

```js
try {
  abort("Failed to execute!", "test.ts");
  console.log("This should not execute");
} catch (e) {
  console.log("Got an error: " + e.toString());
} finally {
  console.log("Gracefully shutting down...");
  process.exit(0);
}
```

For strong typing of the error object, import `Exception` from `try-as`

```js
import { JSON } from "json-as";
import { Exception } from "try-as";

function isJSONValid<T>(data: string): boolean {
  try {
    JSON.parse<T>(data);
  } catch (e) {
    const err = e as Exception; // Under the hood, `e` is already an `Exception`, so you can use all the methods without casting!
    console.log("Badly formatted JSON!");
    return false;
  }
  console.log("JSON is valid!");
  return true;
}

isJSONValid<i32[]>("definitely-not-an-array");
```

## 📃 License

This project is distributed under an open source license. You can view the full license using the following link: [License](./LICENSE)

## 📫 Contact

Please send all issues to [GitHub Issues](https://github.com/JairusSW/as-json/issues) and to converse, please send me an email at [me@jairus.dev](mailto:me@jairus.dev)

- **Email:** Send me inquiries, questions, or requests at [me@jairus.dev](mailto:me@jairus.dev)
- **GitHub:** Visit the official GitHub repository [Here](https://github.com/JairusSW/as-json)
- **Website:** Visit my official website at [jairus.dev](https://jairus.dev/)
- **Discord:** Converse with me on [My Discord](https://discord.com/users/600700584038760448) or on the [AssemblyScript Discord Server](https://discord.gg/assemblyscript/)
