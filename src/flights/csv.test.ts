import { describe, expect, it } from 'vitest'
import { parseCsv, parseCsvRecords } from './csv'

describe('parseCsv', () => {
  it('splits simple rows', () => {
    expect(parseCsv('a,b,c\n1,2,3\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  it('handles quotes, escaped quotes, commas and newlines inside fields', () => {
    expect(parseCsv('x,y\n"hello, world","say ""hi""\nthere"')).toEqual([
      ['x', 'y'],
      ['hello, world', 'say "hi"\nthere'],
    ])
  })

  it('keeps empty fields and handles CRLF', () => {
    expect(parseCsv('a,,c\r\n,,\r\n')).toEqual([
      ['a', '', 'c'],
      ['', '', ''],
    ])
  })

  it('strips a byte-order mark', () => {
    expect(parseCsvRecords('﻿Date,From\n2024-01-01,ATL')).toEqual([{ Date: '2024-01-01', From: 'ATL' }])
  })

  it('pads short rows with empty strings', () => {
    expect(parseCsvRecords('a,b,c\n1')).toEqual([{ a: '1', b: '', c: '' }])
  })
})
