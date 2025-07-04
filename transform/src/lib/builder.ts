// Taken from https://github.com/as-pect/visitor-as/blob/master/src/astBuilder.ts
// tslint:disable: as-internal-case

import { CommonFlags, TypeNode, Node, NodeKind, Source, NamedTypeNode, FunctionTypeNode, TypeParameterNode, IdentifierExpression, CallExpression, ClassExpression, ElementAccessExpression, FunctionExpression, InstanceOfExpression, LiteralExpression, NewExpression, ParenthesizedExpression, PropertyAccessExpression, TernaryExpression, UnaryPostfixExpression, UnaryPrefixExpression, BlockStatement, BreakStatement, ContinueStatement, DoStatement, EmptyStatement, ExportStatement, ExportDefaultStatement, ExportImportStatement, ExpressionStatement, ForStatement, IfStatement, ImportStatement, ReturnStatement, SwitchStatement, ThrowStatement, TryStatement, VariableStatement, WhileStatement, ClassDeclaration, EnumDeclaration, EnumValueDeclaration, FieldDeclaration, FunctionDeclaration, ImportDeclaration, InterfaceDeclaration, MethodDeclaration, NamespaceDeclaration, TypeDeclaration, VariableDeclaration, DecoratorNode, ExportMember, ParameterNode, SwitchCase, TypeName, ArrayLiteralExpression, Expression, ObjectLiteralExpression, AssertionKind, LiteralKind, FloatLiteralExpression, StringLiteralExpression, RegexpLiteralExpression, UnaryExpression, ArrowKind, ParameterKind, DeclarationStatement, AssertionExpression, BinaryExpression, CommaExpression, IntegerLiteralExpression, isTypeOmitted, operatorTokenToString, ForOfStatement, IndexSignatureNode, TemplateLiteralExpression, util, FalseExpression, NullExpression, TrueExpression } from "assemblyscript/dist/assemblyscript.js";
import { Visitor } from "./visitor.js";
import { ThisExpression } from "types:assemblyscript/src/ast";

function assert<T>(isTruish: T, message: string = "assertion error"): T {
  if (!isTruish) throw new Error(message);
  return isTruish;
}

/** An AST builder. */
export class ASTBuilder extends Visitor {
  /** Rebuilds the textual source from the specified AST, as far as possible. */
  static build(node: Node): string {
    var builder = new ASTBuilder();
    builder.visitNode(node);
    return builder.finish();
  }

  private sb: string[] = [];
  private indentLevel: number = 0;
  visitNode(node: Node) {
    return this.visit(node);
  }

  visitSource(source: Source): void {
    var statements = source.statements;
    for (let i = 0, k = statements.length; i < k; ++i) {
      this.visitNodeAndTerminate(statements[i]);
    }
  }

  visitThisExpression(node: ThisExpression, ref: Node | Node[] | null = null): void {
    this.sb.push("this");
    super.visitThisExpression(node, ref);
  }
  // types

  visitTypeNode(node: TypeNode): void {
    switch (node.kind) {
      case NodeKind.NamedType: {
        this.visitNamedTypeNode(<NamedTypeNode>node);
        break;
      }
      case NodeKind.FunctionType: {
        this.visitFunctionTypeNode(<FunctionTypeNode>node);
        break;
      }
      default:
        assert(false);
    }
  }

  visitTypeName(node: TypeName): void {
    this.visitIdentifierExpression(node.identifier);
    var sb = this.sb;
    var current = node.next;
    while (current) {
      sb.push(".");
      this.visitIdentifierExpression(current.identifier);
      current = current.next;
    }
  }

  visitNamedTypeNode(node: NamedTypeNode): void {
    this.visitTypeName(node.name);
    var typeArguments = node.typeArguments;
    if (typeArguments) {
      let numTypeArguments = typeArguments.length;
      let sb = this.sb;
      if (numTypeArguments) {
        sb.push("<");
        this.visitTypeNode(typeArguments[0]);
        for (let i = 1; i < numTypeArguments; ++i) {
          sb.push(", ");
          this.visitTypeNode(typeArguments[i]);
        }
        sb.push(">");
      }
      if (node.isNullable) sb.push(" | null");
    }
  }

  visitFunctionTypeNode(node: FunctionTypeNode): void {
    var isNullable = node.isNullable;
    var sb = this.sb;
    sb.push(isNullable ? "((" : "(");
    var explicitThisType = node.explicitThisType;
    if (explicitThisType) {
      sb.push("this: ");
      this.visitTypeNode(explicitThisType);
    }
    var parameters = node.parameters;
    var numParameters = parameters.length;
    if (numParameters) {
      if (explicitThisType) sb.push(", ");
      this.serializeParameter(parameters[0]);
      for (let i = 1; i < numParameters; ++i) {
        sb.push(", ");
        this.serializeParameter(parameters[i]);
      }
    }
    var returnType = node.returnType;
    if (returnType) {
      sb.push(") => ");
      this.visitTypeNode(returnType);
    } else {
      sb.push(") => void");
    }
    if (isNullable) sb.push(") | null");
  }

  visitTypeParameter(node: TypeParameterNode): void {
    this.visitIdentifierExpression(node.name);
    var extendsType = node.extendsType;
    if (extendsType) {
      this.sb.push(" extends ");
      this.visitTypeNode(extendsType);
    }
    var defaultType = node.defaultType;
    if (defaultType) {
      this.sb.push("=");
      this.visitTypeNode(defaultType);
    }
  }

  // expressions

  visitIdentifierExpression(node: IdentifierExpression): void {
    if (node.isQuoted) this.visitStringLiteral(node.text);
    else this.sb.push(node.text);
  }

  visitArrayLiteralExpression(node: ArrayLiteralExpression): void {
    var sb = this.sb;
    sb.push("[");
    var elements = node.elementExpressions;
    var numElements = elements.length;
    if (numElements) {
      let element = elements[0];
      if (element) this.visitNode(element);
      for (let i = 1; i < numElements; ++i) {
        element = elements[i];
        sb.push(", ");
        if (element) this.visitNode(element);
      }
    }
    sb.push("]");
  }

  visitObjectLiteralExpression(node: ObjectLiteralExpression): void {
    var sb = this.sb;
    var names = node.names;
    var values = node.values;
    var numElements = names.length;
    assert(numElements == values.length);
    if (numElements) {
      sb.push("{\n");
      util.indent(sb, ++this.indentLevel);
      this.visitNode(names[0]);
      sb.push(": ");
      this.visitNode(values[0]);
      for (let i = 1; i < numElements; ++i) {
        sb.push(",\n");
        util.indent(sb, this.indentLevel);
        let name = names[i];
        let value = values[i];
        if (name == value) {
          this.visitNode(name);
        } else {
          this.visitNode(name);
          sb.push(": ");
          this.visitNode(value);
        }
      }
      sb.push("\n");
      util.indent(sb, --this.indentLevel);
      sb.push("}");
    } else {
      sb.push("{}");
    }
  }

  visitAssertionExpression(node: AssertionExpression): void {
    var sb = this.sb;
    switch (node.assertionKind) {
      case AssertionKind.Prefix: {
        sb.push("<");
        if (node.toType) this.visitTypeNode(node.toType);
        sb.push(">");
        this.visitNode(node.expression);
        break;
      }
      case AssertionKind.As: {
        this.visitNode(node.expression);
        sb.push(" as ");
        if (node.toType) this.visitTypeNode(node.toType);
        break;
      }
      case AssertionKind.NonNull: {
        this.visitNode(node.expression);
        sb.push("!");
        break;
      }
      case AssertionKind.Const: {
        this.visitNode(node.expression);
        sb.push(" as const");
        break;
      }
      default:
        assert(false);
    }
  }

  visitBinaryExpression(node: BinaryExpression): void {
    var sb = this.sb;
    this.visitNode(node.left);
    sb.push(" ");
    sb.push(operatorTokenToString(node.operator));
    sb.push(" ");
    this.visitNode(node.right);
  }

  visitCallExpression(node: CallExpression): void {
    this.visitNode(node.expression);
    this.visitArguments(node.typeArguments, node.args);
  }

  visitArguments(typeArguments: TypeNode[] | null, args: Expression[]): void {
    var sb = this.sb;
    if (typeArguments) {
      let numTypeArguments = typeArguments.length;
      if (numTypeArguments) {
        sb.push("<");
        this.visitTypeNode(typeArguments[0]);
        for (let i = 1; i < numTypeArguments; ++i) {
          sb.push(", ");
          this.visitTypeNode(typeArguments[i]);
        }
        sb.push(">(");
      }
    } else {
      sb.push("(");
    }
    var numArgs = args.length;
    if (numArgs) {
      this.visitNode(args[0]);
      for (let i = 1; i < numArgs; ++i) {
        sb.push(", ");
        this.visitNode(args[i]);
      }
    }
    sb.push(")");
  }

  visitClassExpression(node: ClassExpression): void {
    var declaration = node.declaration;
    this.visitClassDeclaration(declaration);
  }

  visitCommaExpression(node: CommaExpression): void {
    var expressions = node.expressions;
    var numExpressions = expressions.length;
    this.visitNode(expressions[0]);
    var sb = this.sb;
    for (let i = 1; i < numExpressions; ++i) {
      sb.push(",");
      this.visitNode(expressions[i]);
    }
  }

  visitElementAccessExpression(node: ElementAccessExpression): void {
    var sb = this.sb;
    this.visitNode(node.expression);
    sb.push("[");
    this.visitNode(node.elementExpression);
    sb.push("]");
  }

  visitFunctionExpression(node: FunctionExpression): void {
    var declaration = node.declaration;
    if (!declaration.arrowKind) {
      if (declaration.name.text.length) {
        this.sb.push("function ");
      } else {
        this.sb.push("function");
      }
    } else {
      assert(declaration.name.text.length == 0);
    }
    this.visitFunctionCommon(declaration);
  }

  visitLiteralExpression(node: LiteralExpression): void {
    switch (node.literalKind) {
      case LiteralKind.Float: {
        this.visitFloatLiteralExpression(<FloatLiteralExpression>node);
        break;
      }
      case LiteralKind.Integer: {
        this.visitIntegerLiteralExpression(<IntegerLiteralExpression>node);
        break;
      }
      case LiteralKind.String: {
        this.visitStringLiteralExpression(<StringLiteralExpression>node);
        break;
      }
      case LiteralKind.Template: {
        this.visitTemplateLiteralExpression(<TemplateLiteralExpression>node);
        break;
      }
      case LiteralKind.RegExp: {
        this.visitRegexpLiteralExpression(<RegexpLiteralExpression>node);
        break;
      }
      case LiteralKind.Array: {
        this.visitArrayLiteralExpression(<ArrayLiteralExpression>node);
        break;
      }
      case LiteralKind.Object: {
        this.visitObjectLiteralExpression(<ObjectLiteralExpression>node);
        break;
      }
      default: {
        assert(false);
        break;
      }
    }
  }

  visitFloatLiteralExpression(node: FloatLiteralExpression): void {
    this.sb.push(node.value.toString());
  }

  visitInstanceOfExpression(node: InstanceOfExpression): void {
    this.visitNode(node.expression);
    this.sb.push(" instanceof ");
    this.visitTypeNode(node.isType);
  }

  visitIntegerLiteralExpression(node: IntegerLiteralExpression): void {
    this.sb.push(i64_to_string(node.value));
  }

  visitStringLiteral(str: string): void {
    var sb = this.sb;
    sb.push('"');
    this.visitRawString(str, util.CharCode.DoubleQuote);
    sb.push('"');
  }

  private visitRawString(str: string, quote: util.CharCode): void {
    var sb = this.sb;
    var off = 0;
    var i = 0;
    for (let k = str.length; i < k; ) {
      switch (str.charCodeAt(i)) {
        case util.CharCode.Null: {
          if (i > off) sb.push(str.substring(off, (off = i + 1)));
          sb.push("\\0");
          off = ++i;
          break;
        }
        case util.CharCode.Backslash: {
          if (i > off) sb.push(str.substring(off, i));
          off = ++i;
          sb.push("\\b");
          break;
        }
        case util.CharCode.Tab: {
          if (i > off) sb.push(str.substring(off, i));
          off = ++i;
          sb.push("\\t");
          break;
        }
        case util.CharCode.LineFeed: {
          if (i > off) sb.push(str.substring(off, i));
          off = ++i;
          sb.push("\\n");
          break;
        }
        case util.CharCode.VerticalTab: {
          if (i > off) sb.push(str.substring(off, i));
          off = ++i;
          sb.push("\\v");
          break;
        }
        case util.CharCode.FormFeed: {
          if (i > off) sb.push(str.substring(off, i));
          off = ++i;
          sb.push("\\f");
          break;
        }
        case util.CharCode.CarriageReturn: {
          if (i > off) sb.push(str.substring(off, i));
          sb.push("\\r");
          off = ++i;
          break;
        }
        case util.CharCode.DoubleQuote: {
          if (quote == util.CharCode.DoubleQuote) {
            if (i > off) sb.push(str.substring(off, i));
            sb.push('\\"');
            off = ++i;
          } else {
            ++i;
          }
          break;
        }
        case util.CharCode.SingleQuote: {
          if (quote == util.CharCode.SingleQuote) {
            if (i > off) sb.push(str.substring(off, i));
            sb.push("\\'");
            off = ++i;
          } else {
            ++i;
          }
          break;
        }
        case util.CharCode.Backslash: {
          if (i > off) sb.push(str.substring(off, i));
          sb.push("\\\\");
          off = ++i;
          break;
        }
        case util.CharCode.Backtick: {
          if (quote == util.CharCode.Backtick) {
            if (i > off) sb.push(str.substring(off, i));
            sb.push("\\`");
            off = ++i;
          } else {
            ++i;
          }
          break;
        }
        default: {
          ++i;
          break;
        }
      }
    }
    if (i > off) sb.push(str.substring(off, i));
  }

  visitStringLiteralExpression(node: StringLiteralExpression): void {
    this.visitStringLiteral(node.value);
  }

  visitTemplateLiteralExpression(node: TemplateLiteralExpression): void {
    var sb = this.sb;
    var tag = node.tag;
    var parts = node.parts;
    var expressions = node.expressions;
    if (tag) this.visitNode(tag);
    sb.push("`");
    this.visitRawString(parts[0], util.CharCode.Backtick);
    assert(parts.length == expressions.length + 1);
    for (let i = 0, k = expressions.length; i < k; ++i) {
      sb.push("${");
      this.visitNode(expressions[i]);
      sb.push("}");
      this.visitRawString(parts[i + 1], util.CharCode.Backtick);
    }
    sb.push("`");
  }

  visitRegexpLiteralExpression(node: RegexpLiteralExpression): void {
    var sb = this.sb;
    sb.push("/");
    sb.push(node.pattern);
    sb.push("/");
    sb.push(node.patternFlags);
  }

  visitNewExpression(node: NewExpression): void {
    this.sb.push("new ");
    this.visitTypeName(node.typeName);
    this.visitArguments(node.typeArguments, node.args);
  }

  visitParenthesizedExpression(node: ParenthesizedExpression): void {
    var sb = this.sb;
    sb.push("(");
    this.visitNode(node.expression);
    sb.push(")");
  }

  visitPropertyAccessExpression(node: PropertyAccessExpression): void {
    this.visitNode(node.expression);
    this.sb.push(".");
    this.visitIdentifierExpression(node.property);
  }

  visitTernaryExpression(node: TernaryExpression): void {
    var sb = this.sb;
    this.visitNode(node.condition);
    sb.push(" ? ");
    this.visitNode(node.ifThen);
    sb.push(" : ");
    this.visitNode(node.ifElse);
  }

  visitUnaryExpression(node: UnaryExpression): void {
    switch (node.kind) {
      case NodeKind.UnaryPostfix: {
        this.visitUnaryPostfixExpression(<UnaryPostfixExpression>node);
        break;
      }
      case NodeKind.UnaryPrefix: {
        this.visitUnaryPrefixExpression(<UnaryPrefixExpression>node);
        break;
      }
      default:
        assert(false);
    }
  }

  visitUnaryPostfixExpression(node: UnaryPostfixExpression): void {
    this.visitNode(node.operand);
    this.sb.push(operatorTokenToString(node.operator));
  }

  visitUnaryPrefixExpression(node: UnaryPrefixExpression): void {
    this.sb.push(operatorTokenToString(node.operator));
    this.visitNode(node.operand);
  }

  // statements

  visitNodeAndTerminate(node: Node): void {
    if (!node) return;
    this.visitNode(node);
    var sb = this.sb;
    if (
      !sb.length || // leading EmptyStatement
      node.kind == NodeKind.Variable || // potentially assigns a FunctionExpression
      node.kind == NodeKind.Expression // potentially assigns a FunctionExpression
    ) {
      sb.push(";\n");
    } else {
      let last = sb[sb.length - 1];
      let lastCharPos = last.length - 1;
      if (lastCharPos >= 0 && (last.charCodeAt(lastCharPos) == util.CharCode.CloseBrace || last.charCodeAt(lastCharPos) == util.CharCode.Semicolon)) {
        sb.push("\n");
      } else {
        sb.push(";\n");
      }
    }
  }

  visitBlockStatement(node: BlockStatement): void {
    var sb = this.sb;
    var statements = node.statements;
    var numStatements = statements.length;
    if (numStatements) {
      sb.push("{\n");
      let indentLevel = ++this.indentLevel;
      for (let i = 0; i < numStatements; ++i) {
        util.indent(sb, indentLevel);
        this.visitNodeAndTerminate(statements[i]);
      }
      util.indent(sb, --this.indentLevel);
      sb.push("}");
    } else {
      sb.push("{}");
    }
  }

  visitBreakStatement(node: BreakStatement): void {
    var label = node.label;
    if (label) {
      this.sb.push("break ");
      this.visitIdentifierExpression(label);
    } else {
      this.sb.push("break");
    }
  }

  visitContinueStatement(node: ContinueStatement): void {
    var label = node.label;
    if (label) {
      this.sb.push("continue ");
      this.visitIdentifierExpression(label);
    } else {
      this.sb.push("continue");
    }
  }

  visitClassDeclaration(node: ClassDeclaration, isDefault = false): void {
    var decorators = node.decorators;
    if (decorators) {
      for (let i = 0, k = decorators.length; i < k; ++i) {
        this.serializeDecorator(decorators[i]);
      }
    }
    var sb = this.sb;
    if (isDefault) {
      sb.push("export default ");
    } else {
      this.serializeExternalModifiers(node);
    }
    if (node.is(CommonFlags.Abstract)) sb.push("abstract ");
    if (node.name.text.length) {
      sb.push("class ");
      this.visitIdentifierExpression(node.name);
    } else {
      sb.push("class");
    }
    var typeParameters = node.typeParameters;
    if (typeParameters != null && typeParameters.length > 0) {
      sb.push("<");
      this.visitTypeParameter(typeParameters[0]);
      for (let i = 1, k = typeParameters.length; i < k; ++i) {
        sb.push(", ");
        this.visitTypeParameter(typeParameters[i]);
      }
      sb.push(">");
    }
    var extendsType = node.extendsType;
    if (extendsType) {
      sb.push(" extends ");
      this.visitTypeNode(extendsType);
    }
    var implementsTypes = node.implementsTypes;
    if (implementsTypes) {
      let numImplementsTypes = implementsTypes.length;
      if (numImplementsTypes) {
        sb.push(" implements ");
        this.visitTypeNode(implementsTypes[0]);
        for (let i = 1; i < numImplementsTypes; ++i) {
          sb.push(", ");
          this.visitTypeNode(implementsTypes[i]);
        }
      }
    }
    var indexSignature = node.indexSignature;
    var members = node.members;
    var numMembers = members.length;
    if (indexSignature != null || numMembers) {
      sb.push(" {\n");
      let indentLevel = ++this.indentLevel;
      if (indexSignature) {
        util.indent(sb, indentLevel);
        this.visitNodeAndTerminate(indexSignature);
      }
      for (let i = 0, k = members.length; i < k; ++i) {
        let member = members[i];
        if (member.kind != NodeKind.FieldDeclaration || (<FieldDeclaration>member).parameterIndex < 0) {
          util.indent(sb, indentLevel);
          this.visitNodeAndTerminate(member);
        }
      }
      util.indent(sb, --this.indentLevel);
      sb.push("}");
    } else {
      sb.push(" {}");
    }
  }

  visitDoStatement(node: DoStatement): void {
    var sb = this.sb;
    sb.push("do ");
    this.visitNode(node.body);
    if (node.body?.kind == NodeKind.Block) {
      sb.push(" while (");
    } else {
      util.indent(sb, this.indentLevel);
      sb.push("while (");
    }
    this.visitNode(node.condition);
    sb.push(")");
  }

  visitEmptyStatement(node: EmptyStatement): void {
    /* nop */
  }

  visitEnumDeclaration(node: EnumDeclaration, isDefault = false): void {
    var sb = this.sb;
    if (isDefault) {
      sb.push("export default ");
    } else {
      this.serializeExternalModifiers(node);
    }
    if (node.is(CommonFlags.Const)) sb.push("const ");
    sb.push("enum ");
    this.visitIdentifierExpression(node.name);
    var values = node.values;
    var numValues = values.length;
    if (numValues) {
      sb.push(" {\n");
      let indentLevel = ++this.indentLevel;
      util.indent(sb, indentLevel);
      this.visitEnumValueDeclaration(node.values[0]);
      for (let i = 1; i < numValues; ++i) {
        sb.push(",\n");
        util.indent(sb, indentLevel);
        this.visitEnumValueDeclaration(node.values[i]);
      }
      sb.push("\n");
      util.indent(sb, --this.indentLevel);
      sb.push("}");
    } else {
      sb.push(" {}");
    }
  }

  visitEnumValueDeclaration(node: EnumValueDeclaration): void {
    this.visitIdentifierExpression(node.name);
    var initializer = node.initializer;
    if (initializer) {
      this.sb.push(" = ");
      this.visitNode(initializer);
    }
  }

  visitExportImportStatement(node: ExportImportStatement): void {
    var sb = this.sb;
    sb.push("export import ");
    this.visitIdentifierExpression(node.externalName);
    sb.push(" = ");
    this.visitIdentifierExpression(node.name);
  }

  visitExportMember(node: ExportMember): void {
    this.visitIdentifierExpression(node.localName);
    if (node.exportedName.text != node.localName.text) {
      this.sb.push(" as ");
      this.visitIdentifierExpression(node.exportedName);
    }
  }

  visitExportStatement(node: ExportStatement): void {
    var sb = this.sb;
    if (node.isDeclare) {
      sb.push("declare ");
    }
    var members = node.members;
    if (members == null) {
      sb.push("export *");
    } else if (members.length > 0) {
      let numMembers = members.length;
      sb.push("export {\n");
      let indentLevel = ++this.indentLevel;
      util.indent(sb, indentLevel);
      this.visitExportMember(members[0]);
      for (let i = 1; i < numMembers; ++i) {
        sb.push(",\n");
        util.indent(sb, indentLevel);
        this.visitExportMember(members[i]);
      }
      --this.indentLevel;
      sb.push("\n}");
    } else {
      sb.push("export {}");
    }
    var path = node.path;
    if (path) {
      sb.push(" from ");
      this.visitStringLiteralExpression(path);
    }
    sb.push(";");
  }

  visitExportDefaultStatement(node: ExportDefaultStatement): void {
    var declaration = node.declaration;
    switch (declaration.kind) {
      case NodeKind.EnumDeclaration: {
        this.visitEnumDeclaration(<EnumDeclaration>declaration, true);
        break;
      }
      case NodeKind.FunctionDeclaration: {
        this.visitFunctionDeclaration(<FunctionDeclaration>declaration, true);
        break;
      }
      case NodeKind.ClassDeclaration: {
        this.visitClassDeclaration(<ClassDeclaration>declaration, true);
        break;
      }
      case NodeKind.InterfaceDeclaration: {
        this.visitInterfaceDeclaration(<InterfaceDeclaration>declaration, true);
        break;
      }
      case NodeKind.NamespaceDeclaration: {
        this.visitNamespaceDeclaration(<NamespaceDeclaration>declaration, true);
        break;
      }
      default:
        assert(false);
    }
  }

  visitExpressionStatement(node: ExpressionStatement): void {
    this.visitNode(node.expression);
  }

  visitFieldDeclaration(node: FieldDeclaration): void {
    var decorators = node.decorators;
    if (decorators) {
      for (let i = 0, k = decorators.length; i < k; ++i) {
        this.serializeDecorator(decorators[i]);
      }
    }
    this.serializeAccessModifiers(node);
    this.visitIdentifierExpression(node.name);
    var sb = this.sb;
    if (node.flags & CommonFlags.DefinitelyAssigned) {
      sb.push("!");
    }
    var type = node.type;
    if (type) {
      sb.push(": ");
      this.visitTypeNode(type);
    }
    var initializer = node.initializer;
    if (initializer) {
      sb.push(" = ");
      this.visitNode(initializer);
    }
  }

  visitForStatement(node: ForStatement): void {
    var sb = this.sb;
    sb.push("for (");
    var initializer = node.initializer;
    if (initializer) {
      this.visitNode(initializer);
    }
    var condition = node.condition;
    if (condition) {
      sb.push("; ");
      this.visitNode(condition);
    } else {
      sb.push(";");
    }
    var incrementor = node.incrementor;
    if (incrementor) {
      sb.push("; ");
      this.visitNode(incrementor);
    } else {
      sb.push(";");
    }
    sb.push(") ");
    this.visitNode(node.body);
  }

  visitForOfStatement(node: ForOfStatement): void {
    var sb = this.sb;
    sb.push("for (");
    this.visitNode(node.variable);
    sb.push(" of ");
    this.visitNode(node.iterable);
    sb.push(") ");
    this.visitNode(node.body);
  }

  visitFunctionDeclaration(node: FunctionDeclaration, isDefault = false): void {
    var sb = this.sb;
    var decorators = node.decorators;
    if (decorators) {
      for (let i = 0, k = decorators.length; i < k; ++i) {
        this.serializeDecorator(decorators[i]);
      }
    }
    if (isDefault) {
      sb.push("export default ");
    } else {
      this.serializeExternalModifiers(node);
      this.serializeAccessModifiers(node);
    }
    if (node.name.text.length) {
      sb.push("function ");
    } else {
      sb.push("function");
    }
    this.visitFunctionCommon(node);
  }

  visitFunctionCommon(node: FunctionDeclaration): void {
    var sb = this.sb;
    this.visitIdentifierExpression(node.name);
    var signature = node.signature;
    var typeParameters = node.typeParameters;
    if (typeParameters) {
      let numTypeParameters = typeParameters.length;
      if (numTypeParameters) {
        sb.push("<");
        this.visitTypeParameter(typeParameters[0]);
        for (let i = 1; i < numTypeParameters; ++i) {
          sb.push(", ");
          this.visitTypeParameter(typeParameters[i]);
        }
        sb.push(">");
      }
    }
    if (node.arrowKind == ArrowKind.Single) {
      let parameters = signature.parameters;
      assert(parameters.length == 1);
      assert(!signature.explicitThisType);
      this.serializeParameter(parameters[0]);
    } else {
      sb.push("(");
      let parameters = signature.parameters;
      let numParameters = parameters.length;
      let explicitThisType = signature.explicitThisType;
      if (explicitThisType) {
        sb.push("this: ");
        this.visitTypeNode(explicitThisType);
      }
      if (numParameters) {
        if (explicitThisType) sb.push(", ");
        this.serializeParameter(parameters[0]);
        for (let i = 1; i < numParameters; ++i) {
          sb.push(", ");
          this.serializeParameter(parameters[i]);
        }
      }
    }
    var body = node.body;
    var returnType = signature.returnType;
    if (node.arrowKind) {
      if (body) {
        if (node.arrowKind == ArrowKind.Single) {
          assert(isTypeOmitted(returnType));
        } else {
          if (isTypeOmitted(returnType)) {
            sb.push(")");
          } else {
            sb.push("): ");
            this.visitTypeNode(returnType);
          }
        }
        sb.push(" => ");
        this.visitNode(body);
      } else {
        assert(!isTypeOmitted(returnType));
        sb.push(" => ");
        this.visitTypeNode(returnType);
      }
    } else {
      if (!isTypeOmitted(returnType) && !node.isAny(CommonFlags.Constructor | CommonFlags.Set)) {
        sb.push("): ");
        this.visitTypeNode(returnType);
      } else {
        sb.push(")");
      }
      if (body) {
        sb.push(" ");
        this.visitNode(body);
      }
    }
  }

  visitIfStatement(node: IfStatement): void {
    var sb = this.sb;
    sb.push("if (");
    this.visitNode(node.condition);
    sb.push(") ");
    var ifTrue = node.ifTrue;
    this.visitNode(ifTrue);
    if (ifTrue.kind != NodeKind.Block) {
      sb.push(";\n");
    }
    var ifFalse = node.ifFalse;
    if (ifFalse) {
      if (ifTrue.kind == NodeKind.Block) {
        sb.push(" else ");
      } else {
        sb.push("else ");
      }
      this.visitNode(ifFalse);
    }
  }

  visitImportDeclaration(node: ImportDeclaration): void {
    var externalName = node.foreignName;
    var name = node.name;
    this.visitIdentifierExpression(externalName);
    if (externalName.text != name.text) {
      this.sb.push(" as ");
      this.visitIdentifierExpression(name);
    }
  }

  visitImportStatement(node: ImportStatement): void {
    var sb = this.sb;
    sb.push("import ");
    var declarations = node.declarations;
    var namespaceName = node.namespaceName;
    if (declarations) {
      let numDeclarations = declarations.length;
      if (numDeclarations) {
        sb.push("{\n");
        let indentLevel = ++this.indentLevel;
        util.indent(sb, indentLevel);
        this.visitImportDeclaration(declarations[0]);
        for (let i = 1; i < numDeclarations; ++i) {
          sb.push(",\n");
          util.indent(sb, indentLevel);
          this.visitImportDeclaration(declarations[i]);
        }
        --this.indentLevel;
        sb.push("\n} from ");
      } else {
        sb.push("{} from ");
      }
    } else if (namespaceName) {
      sb.push("* as ");
      this.visitIdentifierExpression(namespaceName);
      sb.push(" from ");
    }
    this.visitStringLiteralExpression(node.path);
  }

  visitIndexSignature(node: IndexSignatureNode): void {
    var sb = this.sb;
    sb.push("[key: ");
    this.visitTypeNode(node.keyType);
    sb.push("]: ");
    this.visitTypeNode(node.valueType);
  }

  visitInterfaceDeclaration(node: InterfaceDeclaration, isDefault = false): void {
    var decorators = node.decorators;
    if (decorators) {
      for (let i = 0, k = decorators.length; i < k; ++i) {
        this.serializeDecorator(decorators[i]);
      }
    }
    var sb = this.sb;
    if (isDefault) {
      sb.push("export default ");
    } else {
      this.serializeExternalModifiers(node);
    }
    sb.push("interface ");
    this.visitIdentifierExpression(node.name);
    var typeParameters = node.typeParameters;
    if (typeParameters != null && typeParameters.length > 0) {
      sb.push("<");
      this.visitTypeParameter(typeParameters[0]);
      for (let i = 1, k = typeParameters.length; i < k; ++i) {
        sb.push(", ");
        this.visitTypeParameter(typeParameters[i]);
      }
      sb.push(">");
    }
    var extendsType = node.extendsType;
    if (extendsType) {
      sb.push(" extends ");
      this.visitTypeNode(extendsType);
    }
    // must not have implementsTypes
    sb.push(" {\n");
    var indentLevel = ++this.indentLevel;
    var members = node.members;
    for (let i = 0, k = members.length; i < k; ++i) {
      util.indent(sb, indentLevel);
      this.visitNodeAndTerminate(members[i]);
    }
    --this.indentLevel;
    sb.push("}");
  }

  visitMethodDeclaration(node: MethodDeclaration): void {
    var decorators = node.decorators;
    if (decorators) {
      for (let i = 0, k = decorators.length; i < k; ++i) {
        this.serializeDecorator(decorators[i]);
      }
    }
    this.serializeAccessModifiers(node);
    if (node.is(CommonFlags.Get)) {
      this.sb.push("get ");
    } else if (node.is(CommonFlags.Set)) {
      this.sb.push("set ");
    }
    this.visitFunctionCommon(node);
  }

  visitNamespaceDeclaration(node: NamespaceDeclaration, isDefault = false): void {
    var decorators = node.decorators;
    if (decorators) {
      for (let i = 0, k = decorators.length; i < k; ++i) {
        this.serializeDecorator(decorators[i]);
      }
    }
    var sb = this.sb;
    if (isDefault) {
      sb.push("export default ");
    } else {
      this.serializeExternalModifiers(node);
    }
    sb.push("namespace ");
    this.visitIdentifierExpression(node.name);
    var members = node.members;
    var numMembers = members.length;
    if (numMembers) {
      sb.push(" {\n");
      let indentLevel = ++this.indentLevel;
      for (let i = 0, k = members.length; i < k; ++i) {
        util.indent(sb, indentLevel);
        this.visitNodeAndTerminate(members[i]);
      }
      util.indent(sb, --this.indentLevel);
      sb.push("}");
    } else {
      sb.push(" {}");
    }
  }

  visitReturnStatement(node: ReturnStatement): void {
    var value = node.value;
    if (value) {
      this.sb.push("return ");
      this.visitNode(value);
    } else {
      this.sb.push("return");
    }
  }

  visitTrueExpression(node: TrueExpression): void {
    this.sb.push("true");
  }

  visitFalseExpression(node: FalseExpression): void {
    this.sb.push("false");
  }
  visitNullExpression(node: NullExpression): void {
    this.sb.push("null");
  }
  visitSwitchCase(node: SwitchCase): void {
    var sb = this.sb;
    var label = node.label;
    if (label) {
      sb.push("case ");
      this.visitNode(label);
      sb.push(":\n");
    } else {
      sb.push("default:\n");
    }
    var statements = node.statements;
    var numStatements = statements.length;
    if (numStatements) {
      let indentLevel = ++this.indentLevel;
      util.indent(sb, indentLevel);
      this.visitNodeAndTerminate(statements[0]);
      for (let i = 1; i < numStatements; ++i) {
        util.indent(sb, indentLevel);
        this.visitNodeAndTerminate(statements[i]);
      }
      --this.indentLevel;
    }
  }

  visitSwitchStatement(node: SwitchStatement): void {
    var sb = this.sb;
    sb.push("switch (");
    this.visitNode(node.condition);
    sb.push(") {\n");
    var indentLevel = ++this.indentLevel;
    var cases = node.cases;
    for (let i = 0, k = cases.length; i < k; ++i) {
      util.indent(sb, indentLevel);
      this.visitSwitchCase(cases[i]);
      sb.push("\n");
    }
    --this.indentLevel;
    sb.push("}");
  }

  visitThrowStatement(node: ThrowStatement): void {
    this.sb.push("throw ");
    this.visitNode(node.value);
  }

  visitTryStatement(node: TryStatement): void {
    var sb = this.sb;
    sb.push("try {\n");
    var indentLevel = ++this.indentLevel;
    var statements = node.bodyStatements;
    for (let i = 0, k = statements.length; i < k; ++i) {
      util.indent(sb, indentLevel);
      this.visitNodeAndTerminate(statements[i]);
    }
    var catchVariable = node.catchVariable;
    if (catchVariable) {
      util.indent(sb, indentLevel - 1);
      sb.push("} catch (");
      this.visitIdentifierExpression(catchVariable);
      sb.push(") {\n");
      let catchStatements = node.catchStatements;
      if (catchStatements) {
        for (let i = 0, k = catchStatements.length; i < k; ++i) {
          util.indent(sb, indentLevel);
          this.visitNodeAndTerminate(catchStatements[i]);
        }
      }
    }
    var finallyStatements = node.finallyStatements;
    if (finallyStatements) {
      util.indent(sb, indentLevel - 1);
      sb.push("} finally {\n");
      for (let i = 0, k = finallyStatements.length; i < k; ++i) {
        util.indent(sb, indentLevel);
        this.visitNodeAndTerminate(finallyStatements[i]);
      }
    }
    util.indent(sb, indentLevel - 1);
    sb.push("}");
  }

  visitTypeDeclaration(node: TypeDeclaration): void {
    var decorators = node.decorators;
    if (decorators) {
      for (let i = 0, k = decorators.length; i < k; ++i) {
        this.serializeDecorator(decorators[i]);
      }
    }
    var sb = this.sb;
    this.serializeExternalModifiers(node);
    sb.push("type ");
    this.visitIdentifierExpression(node.name);
    var typeParameters = node.typeParameters;
    if (typeParameters) {
      let numTypeParameters = typeParameters.length;
      if (numTypeParameters) {
        sb.push("<");
        for (let i = 0; i < numTypeParameters; ++i) {
          this.visitTypeParameter(typeParameters[i]);
        }
        sb.push(">");
      }
    }
    sb.push(" = ");
    this.visitTypeNode(node.type);
  }

  visitVariableDeclaration(node: VariableDeclaration): void {
    this.visitIdentifierExpression(node.name);
    var type = node.type;
    var sb = this.sb;
    if (node.flags & CommonFlags.DefinitelyAssigned) {
      sb.push("!");
    }
    if (type) {
      sb.push(": ");
      this.visitTypeNode(type);
    }
    var initializer = node.initializer;
    if (initializer) {
      sb.push(" = ");
      this.visitNode(initializer);
    }
  }

  visitVariableStatement(node: VariableStatement): void {
    var decorators = node.decorators;
    if (decorators) {
      for (let i = 0, k = decorators.length; i < k; ++i) {
        this.serializeDecorator(decorators[i]);
      }
    }
    var sb = this.sb;
    var declarations = node.declarations;
    var numDeclarations = declarations.length;
    var firstDeclaration = declarations[0];
    this.serializeExternalModifiers(firstDeclaration);
    sb.push(firstDeclaration.is(CommonFlags.Const) ? "const " : firstDeclaration.is(CommonFlags.Let) ? "let " : "var ");
    this.visitVariableDeclaration(node.declarations[0]);
    for (let i = 1; i < numDeclarations; ++i) {
      sb.push(", ");
      this.visitVariableDeclaration(node.declarations[i]);
    }
  }

  visitWhileStatement(node: WhileStatement): void {
    var sb = this.sb;
    sb.push("while (");
    this.visitNode(node.condition);
    var statement = node.body;
    if (statement.kind == NodeKind.Empty) {
      sb.push(")");
    } else {
      sb.push(") ");
      this.visitNode(node.body);
    }
  }

  // other

  serializeDecorator(node: DecoratorNode): void {
    var sb = this.sb;
    sb.push("@");
    this.visitNode(node.name);
    var args = node.args;
    if (args) {
      sb.push("(");
      let numArgs = args.length;
      if (numArgs) {
        this.visitNode(args[0]);
        for (let i = 1; i < numArgs; ++i) {
          sb.push(", ");
          this.visitNode(args[i]);
        }
      }
      sb.push(")\n");
    } else {
      sb.push("\n");
    }
    util.indent(sb, this.indentLevel);
  }

  serializeParameter(node: ParameterNode): void {
    var sb = this.sb;
    var kind = node.parameterKind;
    var implicitFieldDeclaration = node.implicitFieldDeclaration;
    if (implicitFieldDeclaration) {
      this.serializeAccessModifiers(implicitFieldDeclaration);
    }
    if (kind == ParameterKind.Rest) {
      sb.push("...");
    }
    this.visitIdentifierExpression(node.name);
    var type = node.type;
    var initializer = node.initializer;
    if (type) {
      if (kind == ParameterKind.Optional && !initializer) sb.push("?");
      if (!isTypeOmitted(type)) {
        sb.push(": ");
        this.visitTypeNode(type);
      }
    }
    if (initializer) {
      sb.push(" = ");
      this.visitNode(initializer);
    }
  }

  serializeExternalModifiers(node: DeclarationStatement): void {
    var sb = this.sb;
    if (node.is(CommonFlags.Export)) {
      sb.push("export ");
    } else if (node.is(CommonFlags.Import)) {
      sb.push("import ");
    } else if (node.is(CommonFlags.Declare)) {
      sb.push("declare ");
    }
  }

  serializeAccessModifiers(node: DeclarationStatement): void {
    var sb = this.sb;
    if (node.is(CommonFlags.Public)) {
      sb.push("public ");
    } else if (node.is(CommonFlags.Private)) {
      sb.push("private ");
    } else if (node.is(CommonFlags.Protected)) {
      sb.push("protected ");
    }
    if (node.is(CommonFlags.Static)) {
      sb.push("static ");
    } else if (node.is(CommonFlags.Abstract)) {
      sb.push("abstract ");
    }
    if (node.is(CommonFlags.Readonly)) {
      sb.push("readonly ");
    }
  }

  finish(): string {
    var ret = this.sb.join("");
    this.sb = [];
    return ret;
  }
}
