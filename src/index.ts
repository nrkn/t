// nb - temp while testing - later, will only be used in src/tests
import Ajv from 'ajv'

// json-schema-mini-dsl.ts 

/*
  deliberately excludes:

  $ref, $defs, definitions
  not/if/then/else
  dependencies & related
  contentMediaType/contentEncoding
  unevaluated*

  todo:

  ~~1. enu & con - should allow jsonish values, not just primitives~~ - done but 
  verify correctness - bit iffy there on distinguishing metadata vs value.
  Considering not allowing bare objects as args at all, maybe should be eg
  `enu( meta({ title: 'Colors' }), 'red', 'green' )`, 
  obj( meta({ title: 'X' }), props({ ... }) ), etc
  Strong preference for making meta need to be tagged to avoid ambiguity.
  ~~DECISION: make meta tagged explicitly to avoid ambiguity.~~ DONE

  2. we only handle `default` for primitives - it should be possible to handle 
  `default` for objects/arrays too - preferably with type inference disallowing 
  incompatible default values
  DECISION: implement default for objects/arrays too

  3. we don't handle examples at all yet - same as default but an array - 
  actually, do examples have to match the schema? Can we eg have an example of 
  how *not* to use a schema, eg could be used in fixtures for tests, somehow
  mark expect pass/fail for each example in examples? Probably out of scope for 
  now though. I think we should just make examples jsonish
  DECISION: implement examples as jsonish[] - consider in future allowing a flag
  or similar so that users can choose to force valid examples or not.

  4. arrays - missing attributes; contains, minContains, maxContains - 
  ~~investigate if any issues around implementation or typing implications~~ 
  Looked into it, seems like we can just add them to ArrayAttributes.
  DECISION: just add them to ArrayAttributes.

  5. objects - like arrays, missing attributes; propertyNames, 
  patternProperties, minProperties, maxProperties - ~~extend object attr, or 
  extend obj/rec or add new mnemonic function helpers ala rec or...?~~
  As above, just add them to ObjectAttributes.
  DECISION: just add them to ObjectAttributes.

  ~~6. strings - add format to string attributes - as union of known formats?~~
  
  7. tupRest - inconsistent with tup - syntax could be exactly the same as tup 
  with the last arg being treated as the rest schema OR it takes a tup as first 
  arg and rest schema as second arg eg `tupRest( tup( num(), num() ), str() )` 
  - kinda like the idea of helpers that extend existing types - where else could 
  these be useful? However, it *is* a nice clean api as is - perhaps tup should
  be tup([ ...schemas]) instead to make it more consistent with tupRest? Leaning
  slightly toward keeping tupRest with the clean api and making tup take a tuple
  of schema for consistency.
  DECISION: keep tupRest as is for clean api, change tup to take array of
  schemas for consistency.

  8. consider excluding oneOf - doesn't map well to ts, saying it's a union is
  kinda misleading since oneOf fails if multiple match - maybe we should only
  use anyOf/allOf? Or does it not matter because it's fine to only catch that at
  runtime? Leaning slightly toward the latter. Tricky, but after consideration,
  leading toward keeping oneOf for minimal surprises when using the dsl.
  DECISION: keep oneOf.

  9. should we allow the features we deliberately exclude but just ignore them
  for typing purposes? Eg $ref included === parent is Schema<any> etc?
  No decision yet but leaning strongly towards allowing but ignoring for typing.

  10. consider narrowing obj overloads, not sure if we should allow empty 
  objects although they do have some use with eg using patternProperties 
  attributes only - are these better served by using special helpers ala rec?
  Or best left as-is for flexibility?
*/

// ---------- core brands & utils ----------

export const SCHEMA: unique symbol = Symbol('schema')
export const META: unique symbol = Symbol('meta')

// Flattens intersections at the top level
export type Simplify<T> = { [K in keyof T]: T[K] } & {}

type DeepSimplifyTuple<T extends readonly unknown[]> =
  T extends readonly []
    ? []
    : T extends readonly [infer H, ...infer R]
      ? [DeepSimplify<H>, ...DeepSimplifyTuple<R>]
      : T extends ReadonlyArray<infer U>
        ? DeepSimplify<U>[]
        : T

export type DeepSimplify<T> =
  T extends (...args: any) => any
    ? T
    : T extends readonly unknown[]
      // handles tuples (with or without rest) *and* plain arrays
      ? DeepSimplifyTuple<T>
      : T extends object
        ? { [K in keyof T]: DeepSimplify<T[K]> } & {}
        : T

// NOTE: no index signature here on purpose; 
// we intersect concrete shapes per factory
export type Schema<T> = { readonly [SCHEMA]: true; readonly __t?: T }

export type InferFromRaw<S> = S extends { __t?: infer T } ? T : never

type TupleSchema<S> =
  S extends { type: 'array'; prefixItems: readonly Schema<any>[] }
    ? true
    : false

//export type InferFrom<S> = DeepSimplify<InferFromRaw<S>>
export type InferFrom<S> =
  InferFromRaw<S> extends infer T
    ? TupleSchema<S> extends true
      // tuple or tupRest: keep the raw tuple type
      ? T
      // everything else: keep using DeepSimplify
      : DeepSimplify<T>
    : never

const brand = <T, S extends object>(o: S) => {
  Object.defineProperty(o, SCHEMA, { value: true })

  return o as Schema<T> & S
}

const isSchema = (x: unknown): x is Schema<unknown> =>
  !!x && typeof x === 'object' && (x as any)[SCHEMA] === true

// Explicitly tagged metadata helper
export type Meta<M extends Metadata = Metadata> = (
  Readonly<M> & { readonly [META]: true }
)

export const meta = <M extends Metadata>(m: M): Meta<M> => {
  const tagged = { ...(m ?? {}) } as Meta<M>

  Object.defineProperty(tagged, META, { value: true })

  return tagged
}

const isMeta = (x: unknown): x is Meta =>
  !!x && typeof x === 'object' && (x as any)[META] === true

// ---------- metadata & attribute shapes ----------

type DollarExt = { [K in `$${string}`]?: unknown }

export type Metadata = DollarExt & {
  $id?: string
  title?: string
  description?: string
  $comment?: string
}

type WithDefault<T> = { default?: T }

export type NumberAttributes = Metadata & WithDefault<number> & {
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number
  exclusiveMaximum?: number
  multipleOf?: number
}

export type StringAttributes = Metadata & WithDefault<string> & {
  minLength?: number
  maxLength?: number
  pattern?: string
  format?: (
    'email' | 'uri' | 'uuid' | 'date' | 'date-time' | 'ipv4' | 'ipv6' |
    (string & {})
  )
}

export type BooleanAttributes = Metadata & WithDefault<boolean>

export type ObjectAttributes = Metadata & {
  additionalProperties?: boolean | Schema<any>
  minProperties?: number
  maxProperties?: number
}

export type ArrayAttributes = Metadata & {
  minItems?: number
  maxItems?: number
  uniqueItems?: boolean
}

// Tuple-specific attributes (currently mirrors ArrayAttributes for symmetry)
export type TupleAttributes = ArrayAttributes

// ---------- primitive factories (precise shapes) ----------

export const nul = (meta?: Meta<Metadata>) =>
  brand<null, Readonly<{ type: 'null' } & Metadata>>(
    { type: 'null', ...(meta ?? {}) }
  )

export const int = (meta?: Meta<NumberAttributes>) =>
  brand<number, Readonly<{ type: 'integer' } & NumberAttributes>>(
    { type: 'integer', ...(meta ?? {}) }
  )

export const num = (meta?: Meta<NumberAttributes>) =>
  brand<number, Readonly<{ type: 'number' } & NumberAttributes>>(
    { type: 'number', ...(meta ?? {}) }
  )

export const str = (meta?: Meta<StringAttributes>) =>
  brand<string, Readonly<{ type: 'string' } & StringAttributes>>(
    { type: 'string', ...(meta ?? {}) }
  )

export const bool = (meta?: Meta<BooleanAttributes>) =>
  brand<boolean, Readonly<{ type: 'boolean' } & BooleanAttributes>>(
    { type: 'boolean', ...(meta ?? {}) }
  )

// ---------- props envelope & object builder ----------

export const PROPS: unique symbol = Symbol('props')

type PropMap = Record<string, Schema<any>>
type RequiredKeys<P extends PropMap> = readonly (keyof P)[]

type PropsEnvelope<P extends PropMap, R extends RequiredKeys<P>> = {
  readonly [PROPS]: true
  readonly properties: P
  readonly required?: R
}

const makeProps = <
  P extends PropMap,
  const R extends RequiredKeys<P>
>(p: P, req: R | undefined): PropsEnvelope<P, R> => {
  const env = {
    properties: p,
    ...(req?.length ? { required: req } : {})
  } as PropsEnvelope<P, R>

  Object.defineProperty(env, PROPS, { value: true })

  return env
}

const isProps = (x: unknown): x is PropsEnvelope<any, any> =>
  !!x && typeof x === 'object' && (x as any)[PROPS] === true

// optional with required keys specified
export const props = <P extends PropMap, const R extends RequiredKeys<P>>(
  p: P, ...req: R
) => makeProps(p, req)

// all required
export const reqProps = <P extends PropMap>(p: P) =>
  makeProps(p, Object.keys(p) as unknown as readonly (keyof P)[])

type BuildObject<P extends PropMap, R extends readonly (keyof P)[]> =
  { [K in R[number]]-?: InferFromRaw<P[K]> } &
  { [K in Exclude<keyof P, R[number]>]?: InferFromRaw<P[K]> }

// obj() | obj(props) | obj(meta, props) | obj(meta)
type ObjFn = {
  (): Schema<{}> & Readonly<{ type: 'object'; properties: {}; }>

  <P extends PropMap, R extends RequiredKeys<P>>(
    env: PropsEnvelope<P, R>
  ): Schema<BuildObject<P, R>> &
    Readonly<{ type: 'object'; properties: P; required?: R }> &
    Readonly<ObjectAttributes>

  <M extends ObjectAttributes, P extends PropMap, R extends RequiredKeys<P>>(
    meta: Meta<M>, env: PropsEnvelope<P, R>
  ): Schema<BuildObject<P, R>> &
    Readonly<{ type: 'object'; properties: P; required?: R }> &
    Readonly<ObjectAttributes>

  <M extends ObjectAttributes>(
    meta: Meta<M>
  ): Schema<{}> & Readonly<{ type: 'object'; properties: {} }> &
    Readonly<ObjectAttributes>
}

export const obj: ObjFn = (a?: unknown, b?: unknown): any => {
  let meta: ObjectAttributes | undefined
  let env: PropsEnvelope<any, any> | undefined

  if (a && typeof a === 'object' && (a as any)[PROPS]) {
    env = a as any
  } else if (isMeta(a)) {
    meta = a as ObjectAttributes | undefined
  }

  if (b && typeof b === 'object' && (b as any)[PROPS]) {
    env = b as any
  }

  const properties = env?.properties ?? {}
  const required = env?.required as readonly string[] | undefined

  return brand({
    type: 'object',
    properties,
    ...(required && { required: [...required] }),
    ...(meta ?? {})
  } as const)
}

// ---------- arrays & tuples ----------

type ArrFn = {
  <S extends Schema<any>>(
    schema: S
  ): Schema<InferFromRaw<S>[]> & Readonly<{ type: 'array'; items: S }>

  <M extends ArrayAttributes, S extends Schema<any>>(
    meta: Meta<M>, schema: S
  ): Schema<InferFromRaw<S>[]> & Readonly<{ type: 'array'; items: S } &
    ArrayAttributes>
}

export const arr: ArrFn = (a?: unknown, b?: unknown): any => {
  let meta: ArrayAttributes | undefined
  let itemSchema: Schema<any> | undefined

  if (isSchema(a)) {
    itemSchema = a
  } else if (isMeta(a)) {
    meta = a as ArrayAttributes | undefined
  }

  if (isSchema(b)) {
    itemSchema = b
  }

  if (!itemSchema) {
    throw Error('arr(...) requires an item schema')
  }

  return brand({
    type: 'array',
    ...(meta ?? {}),
    items: itemSchema
  } as const)
}

// tuple helpers
type TupleElems<Elems extends readonly Schema<any>[]> = {
  [I in keyof Elems]: (
    Elems[I] extends Schema<any> ?
    InferFromRaw<Elems[I]> :
    never
  )
}

type Mutable<T extends readonly unknown[]> = [...T]

type SchemaArgs = readonly [Schema<any>, ...Schema<any>[]]

type TupleStaticAttributes<E extends SchemaArgs> = {
  type: 'array'
  prefixItems: E
  minItems: E['length']
  maxItems: E['length']
  items: false
}

type TupFn = {
  <const E extends SchemaArgs>(
    ...schemas: E
  ): Schema<Mutable<TupleElems<E>>> & Readonly<TupleStaticAttributes<E>>

  <M extends TupleAttributes, const E extends SchemaArgs>(
    meta: Meta<M>, ...schemas: E
  ): Schema<Mutable<TupleElems<E>>> & Readonly<TupleStaticAttributes<E> &
    TupleAttributes>
}

export const tup: TupFn = (a?: unknown, ...rest: unknown[]): any => {
  let meta: TupleAttributes | undefined
  const schemas: Schema<any>[] = []

  if (a && !isSchema(a)) {
    if (isMeta(a)) meta = a as TupleAttributes
  } else if (isSchema(a)) {
    schemas.push(a)
  }

  for (const r of rest) {
    if (isSchema(r)) schemas.push(r)
  }

  if (schemas.length === 0) {
    throw Error('tup(...) requires at least one schema')
  }

  const base = {
    type: 'array',
    ...(meta ?? {}),
    prefixItems: schemas,
    minItems: schemas.length,
    maxItems: schemas.length,
    items: false
  } as const

  return brand(base)
}

// ---------- tuples with rest ----------

type TupleRestAttr<E extends SchemaArgs, R extends Schema<any>> = {
  type: 'array'
  prefixItems: E
  items: R
  minItems: E['length']
}

type TupRestFn = {
  <const E extends SchemaArgs, R extends Schema<any>>(
    prefix: readonly [...E], rest: R
  ): Schema<[...Mutable<TupleElems<E>>, ...InferFromRaw<R>[]]> &
    Readonly<TupleRestAttr<E, R>>
}

export const tupRest: TupRestFn = (
  prefix: readonly Schema<any>[], rest: Schema<any>
): any => {
  if (!prefix.length) {
    throw Error('tupRest(...) requires at least one prefix schema')
  }

  return brand({
    type: 'array',
    prefixItems: prefix,
    items: rest,
    minItems: prefix.length
  } as const)
}

// ---------- records ----------

export type JSONish = (
  null | boolean | number | string | { readonly [k: string]: JSONish } |
  readonly JSONish[]
)

type RecordFn = {
  <S extends Schema<any>>(
    val: S
  ): Schema<Record<string, InferFromRaw<S>>> &
    Readonly<{ type: 'object'; additionalProperties: S }>

  <M extends ObjectAttributes, S extends Schema<any>>(
    meta: Meta<M>, val: S
  ): Schema<Record<string, InferFromRaw<S>>> &
    Readonly<{ type: 'object'; additionalProperties: S } & ObjectAttributes>
}

export const rec: RecordFn = (a?: unknown, b?: unknown): any => {
  let meta: ObjectAttributes | undefined
  let val: Schema<any> | undefined

  if (isSchema(a)) {
    val = a
  } else if (isMeta(a)) {
    meta = a as ObjectAttributes | undefined
  }

  if (isSchema(b)) {
    val = b
  }

  if (!val) {
    throw Error('rec(...) requires a value schema')
  }

  return brand(
    { type: 'object', ...(meta ?? {}), additionalProperties: val } as const
  )
}

// ---------- enum / const ----------

export type EnumAttributes = Metadata
export type ConstAttributes = Metadata

type EnuFn = {
  <const V extends readonly JSONish[]>(
    ...vals: V
  ): Schema<V[number]> & Readonly<{ enum: V }>

  <M extends EnumAttributes, const V extends readonly JSONish[]>(
    meta: Meta<M>, ...vals: V
  ): Schema<V[number]> & Readonly<{ enum: V } & EnumAttributes>
}

export const enu: EnuFn = (a?: unknown, ...rest: unknown[]): any => {
  let meta: EnumAttributes | undefined
  let vals: readonly JSONish[]

  // metadata must be explicitly tagged to avoid ambiguity with object values
  if (isMeta(a)) {
    meta = a as EnumAttributes
    vals = rest as any
  } else {
    vals = [a, ...rest] as any
  }

  return brand({ ...(meta ?? {}), enum: vals as any } as const)
}

type ConFn = {
  <const V extends JSONish>(
    v: V
  ): Schema<V> & Readonly<{ const: V }>

  <M extends ConstAttributes, const V extends JSONish>(
    meta: Meta<M>, v: V
  ): Schema<V> & Readonly<{ const: V } & ConstAttributes>
}

export const con: ConFn = (a?: unknown, b?: unknown): any => {
  let meta: ConstAttributes | undefined
  let val: JSONish

  // metadata must be explicitly tagged to avoid ambiguity with object values
  if (isMeta(a)) {
    meta = a as ConstAttributes
    val = b as any
  } else {
    val = a as any
  }

  return brand({ ...(meta ?? {}), const: val as any } as const)
}

// ---------- combinators ----------

type UnionToIntersection<U> =
  (U extends unknown ? (x: U) => unknown : never) extends (x: infer I) =>
    unknown ? I : never

type AnyOfFn = {
  <const S extends SchemaArgs>(
    ...schemas: S
  ): Schema<InferFromRaw<S[number]>> & Readonly<{ anyOf: S }>

  <M extends Metadata, const S extends SchemaArgs>(
    meta: Meta<M>, ...schemas: S
  ): Schema<InferFromRaw<S[number]>> & Readonly<{ anyOf: S } & Metadata>
}

type OneOfFn = {
  <const S extends SchemaArgs>(
    ...schemas: S
  ): Schema<InferFromRaw<S[number]>> & Readonly<{ oneOf: S }>

  <M extends Metadata, const S extends SchemaArgs>(
    meta: Meta<M>, ...schemas: S
  ): Schema<InferFromRaw<S[number]>> & Readonly<{ oneOf: S } & Metadata>
}

type AllOfFn = {
  <const S extends SchemaArgs>(
    ...schemas: S
  ): Schema<UnionToIntersection<InferFromRaw<S[number]>>> &
    Readonly<{ allOf: S }>

  <M extends Metadata, const S extends SchemaArgs>(
    meta: Meta<M>, ...schemas: S
  ): Schema<UnionToIntersection<InferFromRaw<S[number]>>> &
    Readonly<{ allOf: S } & Metadata>
}

export const anyOf: AnyOfFn = (a?: unknown, ...rest: unknown[]): any => {
  let meta: Metadata | undefined
  const schemas: Schema<any>[] = []

  if (a && !isSchema(a)) {
    if (isMeta(a)) meta = a as Metadata
  } else if (isSchema(a)) {
    schemas.push(a)
  }

  for (const r of rest) {
    if (isSchema(r)) {
      schemas.push(r)
    }
  }

  if (schemas.length === 0) {
    throw Error('anyOf(...) requires at least one schema')
  }

  return brand({ ...(meta ?? {}), anyOf: schemas } as const)
}

export const oneOf: OneOfFn = (a?: unknown, ...rest: unknown[]): any => {
  let meta: Metadata | undefined
  const schemas: Schema<any>[] = []

  if (a && !isSchema(a)) {
    if (isMeta(a)) meta = a as Metadata
  } else if (isSchema(a)) {
    schemas.push(a)
  }

  for (const r of rest) {
    if (isSchema(r)) schemas.push(r)
  }

  if (schemas.length === 0) {
    throw Error('oneOf(...) requires at least one schema')
  }

  return brand({ ...(meta ?? {}), oneOf: schemas } as const)
}

export const allOf: AllOfFn = (a?: unknown, ...rest: unknown[]): any => {
  let meta: Metadata | undefined
  const schemas: Schema<any>[] = []

  if (a && !isSchema(a)) {
    if (isMeta(a)) meta = a as Metadata
  } else if (isSchema(a)) {
    schemas.push(a)
  }

  for (const r of rest) {
    if (isSchema(r)) {
      schemas.push(r)
    }
  }

  if (schemas.length === 0) {
    throw Error('allOf(...) requires at least one schema')
  }

  return brand({ ...(meta ?? {}), allOf: schemas } as const)
}

// ---------- sample usage ----------

const uint8 = int(meta({ minimum: 0, maximum: 255 }))
const uint8Span = obj(props({ start: uint8, end: uint8 }, 'start'))
const uint8Span2 = obj(reqProps({ start: uint8, end: uint8 }))
const uint8SpanSpan = obj(reqProps({ a: uint8Span, b: uint8Span }))

const objWithMeta = obj(
  meta({ $id: '#/obj', title: 'Object' }), props({ a: int(), b: int() })
)

const uint8Arr = arr(uint8)
const uint8ArrMeta = arr(meta({ title: 'Uint8[]' }), uint8)
const uint8Tup = tup(uint8, uint8)

const enumColor = enu('red', 'orange', 'yellow')
const conFixed = con('fixed')

const uint8SpanArray = arr(uint8Span)

const uint8Rec = rec(uint8)

type Uint8 = InferFrom<typeof uint8>
type Uint8Span = InferFrom<typeof uint8Span>
type Uint8Span2 = InferFrom<typeof uint8Span2>
type Uint8SpanSpan = InferFrom<typeof uint8SpanSpan>
type Uint8Rec = InferFrom<typeof uint8Rec>

const u8ss: Uint8SpanSpan = {
  a: { start: 0, end: 100 },
  b: { start: 150, end: 200 }
}

const ajv = new Ajv()

const isU8ss = ajv.compile<Uint8SpanSpan>(uint8SpanSpan)

const isValid = isU8ss(u8ss)

console.log('u8ss is valid:', isValid)

type Uint8Arr = InferFrom<typeof uint8Arr>
type Uint8ArrMeta = InferFrom<typeof uint8ArrMeta>
type Uint8Tup = InferFrom<typeof uint8Tup>
type ObjMeta = InferFrom<typeof objWithMeta>

type Uint8SpanArray = InferFrom<typeof uint8SpanArray>

type Color = InferFrom<typeof enumColor>
type Fixed = InferFrom<typeof conFixed>

const a = arr(num())
const t = tup(str(), bool())

const tRest = tupRest([num(), num()], str())
const o = obj()
const n = num()
const s = str()
const b = bool()
const nl = nul()

const one = oneOf(num(), str())
const any = anyOf(bool(), nul())
const all = allOf(obj(reqProps({ x: int() })), obj(props({ y: str() })))
const allN = allOf(num(), int())

const oTups = obj(reqProps({ a: tRest, b: t}))

const oneRec = rec(one)

type A = InferFrom<typeof a>
type T = InferFrom<typeof t>

type TR = InferFrom<typeof tRest>

type OTups = InferFrom<typeof oTups>

type O = InferFrom<typeof o>
type N = InferFrom<typeof n>
type S = InferFrom<typeof s>
type B = InferFrom<typeof b>
type NL = InferFrom<typeof nl>
type One = InferFrom<typeof one>
type Any = InferFrom<typeof any>
type All = InferFrom<typeof all>
type AllN = InferFrom<typeof allN>
type OneRec = InferFrom<typeof oneRec>
