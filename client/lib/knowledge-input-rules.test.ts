import { describe, expect, it } from 'vitest'
import {
  cleanContent, cleanTitle, foldTr, isCompleteTrPhone, mapServerError, matchesSearch, maskTitle,
  slugifyLabel, uniqueSlug, validateContent, validateFile, validateGreeting, validateTitle,
  TITLE_MAX, CONTENT_MAX,
} from './knowledge-input-rules'

describe('slug üretimi', () => {
  it('Türkçe karakterleri dönüştürür', () => {
    expect(slugifyLabel('Çocuk Şikâyetleri Üçlü')).toBe('cocuk-sikayetleri-uclu')
    expect(slugifyLabel('ığöşüç İĞÖŞÜÇ')).toBe('igosuc-igosuc')
  })
  it('geçersiz karakterleri atar, boşsa varsayılan verir', () => {
    expect(slugifyLabel('  Kampanya!! %50  ')).toBe('kampanya-50')
    expect(slugifyLabel('!!!')).toBe('kategori')
    expect(/^[a-z0-9_-]+$/.test(slugifyLabel('Ağız & Diş'))).toBe(true)
  })
  it('çakışmada -2, -3 ekler', () => {
    expect(uniqueSlug('Tedavi', ['genel'])).toBe('tedavi')
    expect(uniqueSlug('Tedavi', ['tedavi'])).toBe('tedavi-2')
    expect(uniqueSlug('Tedavi', ['tedavi', 'tedavi-2'])).toBe('tedavi-3')
    expect(uniqueSlug('TEDAVİ', ['Tedavi'])).toBe('tedavi-2')
  })
})

describe('başlık', () => {
  it('boşlukları temizler ve 120 ile sınırlar', () => {
    expect(cleanTitle('  Mayıs   Kampanyası  ')).toBe('Mayıs Kampanyası')
    expect(maskTitle('a'.repeat(300)).length).toBe(TITLE_MAX)
    expect(cleanTitle('a\u200Bb')).toBe('ab')
  })
  it('boş başlık hata verir', () => {
    expect(validateTitle('   ').ok).toBe(false)
    expect(validateTitle('Geçerli').ok).toBe(true)
  })
})

describe('içerik', () => {
  it('en az 10 karakter ister ve kalan sayıyı söyler', () => {
    const r = validateContent('  kısa  ')
    expect(r.ok).toBe(false)
    expect(r.hint).toBe('6 karakter daha yazın')
    expect(validateContent('on karakter!').ok).toBe(true)
  })
  it('üst sınırı uygular', () => {
    expect(cleanContent('x'.repeat(CONTENT_MAX + 50)).length).toBe(CONTENT_MAX)
  })
})

describe('dosya', () => {
  it('uzantı ve boyutu denetler', () => {
    expect(validateFile({ name: 'a.pdf', size: 1000 }).ok).toBe(true)
    expect(validateFile({ name: 'a.exe', size: 1000 }).ok).toBe(false)
    expect(validateFile({ name: 'a.docx', size: 10 * 1024 * 1024 + 1 }).error).toBe("Dosya 10 MB'den büyük olamaz.")
    expect(validateFile({ name: 'A.TXT', size: 5 }).ok).toBe(true)
  })
})

describe('diğer', () => {
  it('karşılama en az 3 karakter', () => {
    expect(validateGreeting('ab').ok).toBe(false)
    expect(validateGreeting('abc').ok).toBe(true)
  })
  it('telefon 0XXXXXXXXXX olmalı', () => {
    expect(isCompleteTrPhone('08503096119')).toBe(true)
    expect(isCompleteTrPhone('0850309')).toBe(false)
  })
  it('Türkçe duyarsız arama', () => {
    expect(foldTr('IŞIK')).toBe(foldTr('ışık'))
    expect(matchesSearch('İmplant Fiyatları', 'implant')).toBe(true)
    expect(matchesSearch('Isırık', 'ISIRIK')).toBe(true)
  })
  it('sunucu hatasını alana eşler', () => {
    expect(mapServerError(409, 'Bu slug zaten mevcut').field).toBe('label')
    expect(mapServerError(400, 'İçerik en az 10 karakter olmalı').field).toBe('content')
    expect(mapServerError(400, 'Gelen Karşılama mesajı en az 3 karakter olmalıdır.').field).toBe('greeting')
    expect(mapServerError(500, 'bilinmeyen').field).toBe('form')
  })
})
