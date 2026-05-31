/**
 * 历史报告本地持久化（IndexedDB，仅客户端）。
 * 用于在浏览器本地保存历次复核结果，支持在「历史报告」页回看。
 * 不上传服务器；清除浏览器数据会一并清除。
 */

export interface HistoryRecord {
  id: string
  ts: number
  fileName: string
  mode: string
  standard: string
  /** 分析结果 markdown 全文 */
  result: string
  /** {figures, ratios, pages, disclosure} 的 JSON 字符串，可能为空 */
  figures: string
  /** 原文（截断）用于"原文定位" */
  sourceText: string
  scope: { pageCount: number | null; charCount: number | null; truncated: boolean } | null
}

const DB_NAME = 'finguard'
const STORE = 'reports'
const VERSION = 1

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('当前环境不支持 IndexedDB'))
      return
    }
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('ts', 'ts', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveReport(rec: HistoryRecord): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(rec)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch (e) {
    // 存档失败不应阻断主流程
    console.error('saveReport failed', e)
  }
}

/** 列出全部历史（按时间倒序），返回轻量元数据 + 完整记录 */
export async function listReports(): Promise<HistoryRecord[]> {
  try {
    const db = await openDb()
    const items = await new Promise<HistoryRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).getAll()
      req.onsuccess = () => resolve((req.result as HistoryRecord[]) || [])
      req.onerror = () => reject(req.error)
    })
    db.close()
    return items.sort((a, b) => b.ts - a.ts)
  } catch (e) {
    console.error('listReports failed', e)
    return []
  }
}

export async function getReport(id: string): Promise<HistoryRecord | null> {
  try {
    const db = await openDb()
    const item = await new Promise<HistoryRecord | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(id)
      req.onsuccess = () => resolve((req.result as HistoryRecord) || null)
      req.onerror = () => reject(req.error)
    })
    db.close()
    return item
  } catch (e) {
    console.error('getReport failed', e)
    return null
  }
}

export async function deleteReport(id: string): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch (e) {
    console.error('deleteReport failed', e)
  }
}
