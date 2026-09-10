import type { IsEqual, IsLiteral, IsStringLiteral, Primitive, SetOptional } from "type-fest";

/**
 * Symbol.toStringTag を持つオブジェクトは Object.prototype.toString.call したときに toStringTag の値が返される。
 * そのため、Symbol.toStringTag を一時的に削除してから内部クラスを取得する。
 */
const stripToStringTag = <T extends object>(value: T): T =>
  Symbol.toStringTag in value ? Object.create(value, { [Symbol.toStringTag]: {} }) : value;
/**
 * Object.prototype.toString.call により得られる内部クラスは、通常の操作では取得できない内部スロットにより定義されるデータ型の識別子であり、ユーザーが定義したプロパティやクラスに影響されない。
 * これにより以下のようなオブジェクトの正確なデータ型を識別できる。
 * - Array (Array.isArray でも識別可能)
 * - arguments オブジェクト
 * - Function (typeof でも識別可能)
 * - Error (Error.isError でも識別可能だが実装が新しく、Safariではバグがある)
 * - Boolean, Number, String (プリミティブな値とオブジェクトラッパーの両方を識別可能)
 * - Date
 * - RegExp
 * 仕様: https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-object.prototype.tostring
 */
const getObjectBuiltinTag = (value: object): string =>
  Object.prototype.toString.call(stripToStringTag(value)).slice(8, -1);

export const isNonNull: <T>(value: T) => value is NonNullable<T> = (value) => value != null;
export const isNull: (value: unknown) => value is null = (value) => value === null;
export const isUndefined: (value: unknown) => value is undefined = (value) => value === undefined;
export const isNullOrUndefined: (value: unknown) => value is null | undefined = (value) =>
  value == null;
export const isNotUndefined = (input: unknown): input is NonNullable<unknown> | null =>
  input !== undefined;
export const isSomeObject: (value: unknown) => value is object = (value): value is object =>
  Object(value) === value;
export const isStringKeyOf =
  <O extends Record<string, unknown>>(obj: O) => <K,>(key: K): key is K & string & keyof O =>
    typeof key === "string" && key in obj;
type UndefinedableKeys<T extends Record<string, unknown>> = {
  [K in keyof T]-?: undefined extends T[K] ? K : never;
}[keyof T];
((_: IsEqual<UndefinedableKeys<{ a: number | undefined; b: string }>, "a">): true => _);
((_: IsEqual<UndefinedableKeys<{ a: number | undefined; b?: string }>, "a" | "b">): true => _);
/** make undefinedable properties optional */
type AddQuestionMark<T extends Record<string, unknown>> = SetOptional<T, UndefinedableKeys<T>>;
((_: IsEqual<AddQuestionMark<{ a: number; b: string }>, { a: number; b: string }>): true => _);
((
  _: IsEqual<
    AddQuestionMark<{ a: number | undefined; b: string }>,
    { a?: number | undefined; b: string }
  >,
): true => _);
export const isObjectOf: <const Properties extends Record<string, unknown>>(
  propertiesGuard: {
    [K in keyof Properties]: unknown extends Properties[K] ? (value: unknown) => boolean
      : (value: unknown) => value is Properties[K];
  },
) => (value: unknown) => value is AddQuestionMark<Properties> =
  <const Properties extends Record<string, unknown>>(
    propertiesGuard: {
      [K in keyof Properties]: unknown extends Properties[K] ? (value: unknown) => boolean
        : (value: unknown) => value is Properties[K];
    },
  ) =>
  (value: unknown): value is AddQuestionMark<Properties> => {
    if (!isSomeObject(value)) {
      return false;
    }
    for (const [key, guard] of Object.entries(propertiesGuard)) {
      if (!guard(key in value ? (value as Record<string, unknown>)[key] : undefined)) {
        return false;
      }
    }
    return true;
  };
export const isTupleOf =
  <const T extends (((value: unknown) => value is unknown) | ((value: unknown) => boolean))[]>(
    predicates: T,
  ) =>
  (
    value: unknown,
  ): value is {
    [K in keyof T]: T[K] extends (value: unknown) => value is infer R ? R
      : ((value: unknown) => boolean) extends T[K] ? unknown
      : never;
  } =>
    isReadonlyArray(value) &&
    value.length === predicates.length &&
    predicates.every((predicate, index) => predicate(value[index]));
export const isString: (value: unknown) => value is string = (value) => typeof value === "string";
export const isStringStartsWith =
  <const Prefix extends string>(prefix: Prefix) =>
  (value: unknown): value is `${Prefix}${string}` => isString(value) && value.startsWith(prefix);
export const isStringEndsWith =
  <const Suffix extends string>(suffix: Suffix) =>
  (value: unknown): value is `${string}${Suffix}` => isString(value) && value.endsWith(suffix);
export const isNumber: (value: unknown) => value is number = (value) => typeof value === "number";
type EnsureLiteral<T extends Primitive> = IsLiteral<T> extends true ? T : never;
export const isLiteral =
  <T extends Primitive>(literal: EnsureLiteral<T>) => (value: unknown): value is T =>
    value === literal;
export const isReadonlyArray = (value: unknown): value is readonly unknown[] =>
  Array.isArray(value);
export const isReadonlyArrayOf =
  <T,>(guard: (value: unknown) => value is T) => (value: unknown): value is readonly T[] =>
    isReadonlyArray(value) && value.every((item) => guard(item));
export const isUndefinedableOf =
  <T,>(guard: (value: unknown) => value is T) => (value: unknown): value is T | undefined =>
    value === undefined || guard(value);
const sizeGetterOfMap: (() => unknown) | undefined = Object.getOwnPropertyDescriptor(
  Map.prototype,
  "size",
)?.get;
const isMap = (value: unknown): value is Map<unknown, unknown> => {
  if (sizeGetterOfMap && typeof value === "object" && isSomeObject(value)) {
    try {
      sizeGetterOfMap.call(value);
      return true;
    } catch (e) {
      if (!isErrorWithName("TypeError")(e)) {
        throw e;
      }
    }
  }
  return false;
};
const sizeGetterOfSet = Object.getOwnPropertyDescriptor(Set.prototype, "size")?.get;
const isSet = (value: unknown): value is Set<unknown> => {
  if (sizeGetterOfSet && typeof value === "object" && isSomeObject(value)) {
    try {
      sizeGetterOfSet.call(value);
      return true;
    } catch (e) {
      if (!isErrorWithName("TypeError")(e)) {
        throw e;
      }
    }
  }
  return false;
};
export const isReadonlyMap = (value: unknown): value is ReadonlyMap<unknown, unknown> =>
  isMap(value);
export const isReadonlySet = (value: unknown): value is ReadonlySet<unknown> => isSet(value);
export const narrowGuard =
  <In, Out extends In>(guard: (value: In) => value is Out) =>
  <In2 extends In>(value: In2): value is Out & In2 => guard(value);

export const isEmptyObject = (value: unknown): value is Record<string, never> =>
  isSomeObject(value) && !Array.isArray(value) && Object.keys(value).length === 0;
export function isNonEmptyArray<T>(value: T[]): value is [T, ...T[]];
export function isNonEmptyArray<T>(value: readonly T[]): value is readonly [T, ...T[]];
export function isNonEmptyArray<T>(value: readonly T[]): value is readonly [T, ...T[]] {
  return Array.isArray(value) && value.length > 0;
}
export type EnsureLiteralArray<T extends readonly Primitive[]> = {
  readonly [K in keyof T]: EnsureLiteral<T[K]>;
};
export const isOneOf: {
  <T extends readonly Primitive[]>(
    value: unknown,
    options: EnsureLiteralArray<T>,
  ): value is T[number];
} = <T extends readonly Primitive[]>(
  value: unknown,
  options: EnsureLiteralArray<T>,
): value is T[number] => {
  const widenedOptions = options as readonly unknown[];
  return widenedOptions.includes(value);
};

let isErrorImpl: ((e: unknown) => boolean) | undefined;
export const isError = (e: unknown): e is Error => {
  if (isErrorImpl === undefined) {
    if (
      "isError" in Error && typeof Error.isError === "function" &&
      Error.isError(new DOMException()) === true
    ) {
      isErrorImpl = Error.isError as (e: unknown) => boolean;
    } else {
      const isErrorTag = (tag: string): boolean => tag === "Error" || tag === "DOMException";
      isErrorImpl = (e: unknown): boolean => isSomeObject(e) && isErrorTag(getObjectBuiltinTag(e));
    }
  }
  return isErrorImpl(e);
};
export const isErrorWithName =
  <Name extends string>(name: IsStringLiteral<Name> extends true ? Name : never) =>
  (e: unknown): e is Error & { name: Name } => isError(e) && e.name === name;

const isCallableMarker = {};
const badArrayLike: { length: never } = Object.create(null, {
  length: {
    get: () => {
      throw isCallableMarker;
    },
  },
});
const constructorRegex = /^\s*class\b/;
const tryFunctionObject = function tryFunctionToStr(value: unknown): boolean {
  try {
    const fnStr = Function.prototype.toString.call(value);
    return !constructorRegex.test(fnStr);
  } catch {
    return false;
  }
};
type Callable = (...args: never[]) => unknown;
export function isCallable(value: unknown): value is Callable {
  if (!value) {
    const isDDA = value == null && value !== null && value !== undefined;
    return isDDA;
  }
  if (typeof value !== "function" && typeof value !== "object") {
    return false;
  }
  try {
    Reflect.apply(value as Callable, null, badArrayLike);
  } catch (e: unknown) {
    if (e !== isCallableMarker) {
      return false;
    }
  }
  return tryFunctionObject(value);
}
