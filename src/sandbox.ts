import Ajv from 'ajv'

import { 
  allOf, anyOf, arr, bool, con, enu, InferFrom, int, meta, nul, num, obj, oneOf, 
  props, rec, reqProps, str, tup, tupRest 
} from './index.js'

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
// New array-form overloads for tup
const uint8TupArr = tup([uint8, uint8])
const uint8TupArrMeta = tup(meta({ title: 'Uint8 pair' }), [uint8, uint8])

const enumColor = enu('red', 'orange', 'yellow')
const conFixed = con('fixed')

const uint8SpanArray = arr(uint8Span)

const uint8Rec = rec(uint8)

// minimal examples demonstrating typed defaults for objects and arrays
const objWithDefault = obj(
  meta({ default: { a: 1 } }),
  props({ a: num() }, 'a')
)

const objWithDefault2 = obj(
  meta({ default: { a: 1 } }),
  props({ a: num() }, 'a')
)

const arrWithDefault = arr(
  meta({ default: [1, 2, 3] }),
  num()
)

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
type Uint8TupArr = InferFrom<typeof uint8TupArr>
type Uint8TupArrMeta = InferFrom<typeof uint8TupArrMeta>
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

const oNested = obj(
  reqProps({
    foo: obj(reqProps({ bar: str() }))
  })
)

const one = oneOf(num(), str())
const any = anyOf(bool(), nul())
const all = allOf(obj(reqProps({ x: int() })), obj(props({ y: str() })))
const allN = allOf(num(), int())

const oTups = obj(reqProps({ a: tRest, b: t }))

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

type ONested = InferFrom<typeof oNested>

type One = InferFrom<typeof one>
type Any = InferFrom<typeof any>
type All = InferFrom<typeof all>
type AllN = InferFrom<typeof allN>
type OneRec = InferFrom<typeof oneRec>

/*
{title:'foo',description:'bar',$id:'baz'}
title('foo'),description('bar'),$id('baz')
*/