import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from '../../test/db'
import { renderPage } from '../../test/render'
import { HomePage } from './HomePage'

beforeEach(resetDb)

describe('HomePage', () => {
  it('下にアプリのバージョンと更新日時を小さく出す', async () => {
    renderPage('/', '/', <HomePage />)
    expect(await screen.findByText(/^v0\.2\.0 ・ \d{1,2}\/\d{1,2} \d{2}:\d{2} 更新$/)).toBeInTheDocument()
  })
})
