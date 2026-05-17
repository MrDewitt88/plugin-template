import { describe, expect, it } from 'vitest'
import { StorageError, toCanonicalError } from '../src/errors.js'

describe('StorageError → Canonical Drift #103 shape', () => {
  it('toCanonical() returns {code, message}', () => {
    const err = new StorageError('not_found', 'item missing')
    expect(err.toCanonical()).toEqual({ code: 'not_found', message: 'item missing' })
  })

  it('includes details when provided', () => {
    const err = new StorageError('conflict', 'duplicate id', { id: 'abc-123' })
    expect(err.toCanonical()).toEqual({
      code: 'conflict',
      message: 'duplicate id',
      details: { id: 'abc-123' },
    })
  })

  it('omits details when undefined', () => {
    const err = new StorageError('invalid_args', 'bad input')
    expect(err.toCanonical()).not.toHaveProperty('details')
  })

  it('is an instance of Error', () => {
    expect(new StorageError('not_found', 'm')).toBeInstanceOf(Error)
  })
})

describe('toCanonicalError() — type-narrowing for thrown errors', () => {
  it('passes through StorageError shape', () => {
    const err = new StorageError('not_found', 'm', { id: 1 })
    expect(toCanonicalError(err)).toEqual({ code: 'not_found', message: 'm', details: { id: 1 } })
  })

  it('duck-types objects with string code+message', () => {
    const err = { code: 'conflict', message: 'dup' }
    expect(toCanonicalError(err)).toEqual({ code: 'conflict', message: 'dup' })
  })

  it('promotes plain Error to storage_error', () => {
    const err = new Error('boom')
    expect(toCanonicalError(err)).toEqual({ code: 'storage_error', message: 'boom' })
  })

  it('stringifies non-Error throwables', () => {
    expect(toCanonicalError('something weird')).toEqual({
      code: 'storage_error',
      message: 'something weird',
    })
  })

  it('preserves details from duck-typed errors', () => {
    const err = { code: 'integrity_violation', message: 'fk', details: { table: 'x' } }
    expect(toCanonicalError(err)).toEqual(err)
  })
})
