# babel-plugin-transform-auth0-rule
A plugin to transform code to only leave `if` conditions and its dependencies in an [Auth0 Rule](https://auth0.com/docs/rules)

# How it works

If you intend to read the source, you _need_ to [read this first](https://github.com/thejameskyle/babel-handbook/blob/master/translations/en/plugin-handbook.md).

Here's a brief description of how it works:

1. It parses only `FunctionDeclarations`, or `FunctionExpression`s.
2. The function's body is traversed (manually, without Babel) to identify all relevant `IfStatement`s. An `IfStatement` is only relevant if it contains a `MemberExpression` for `{context}.clientName` or `{context}.clientID`. (`{context}` is the name of the Rule's `context` parameter.
3. `let _applies = false;` is inserted at the top of the function body.
4. Every traversed `Statement` is considered and it can:
  - Stay; if it is "setup" code (shows up before a relevant `IfStatement`) and if it includes any `Identifier`s in common with the `test` of those relevant `IfStatement`s. (You can imagine how easily this can go wrong when you use variables to alias `MemberExpression`s or "dependencies".)
  - Be removed; if it is "setup" code and nothing seems to depend on it, or if it is a simple `return {Literal};` or `{callback}(null, {user}, {context});`
  - Be replaced by `_applies = true;`; if it is determined to be none of the above. This means that it is "special code"
5. When we reach the last element being traversed, we insert `return _applies;` after it.
