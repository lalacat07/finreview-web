/**
 * 设计令牌（颜色）统一来源——各页面共享，避免在多个文件重复硬编码。
 * 与 globals.css 中的 CSS 变量保持同义；JS 端用于内联样式。
 */

// 顶部深色导航
export const NAV_BG = '#0b1220'
export const NAV_TEXT = '#e2e8f0'
export const NAV_MUTED = '#94a3b8'

// 品牌色（深蓝）
export const BRAND = '#1e40af'
export const BRAND_STRONG = '#1e3a8a'
export const BRAND_STRONG_BG = '#1e3a8a'
export const BRAND_LIGHT = '#2563eb'
export const BRAND_TINT = '#eff6ff'

// 中性
export const BORDER = '#e2e8f0'
export const TEXT_PRIMARY = '#0f172a'
export const TEXT_SECONDARY = '#334155'
export const TEXT_MUTED = '#64748b'
export const TEXT_FAINT = '#94a3b8'

// 风险等级配色
export interface RiskTone {
  bg: string
  border: string
  text: string
  label: string
  dot: string
}

export const RISK: Record<'high' | 'med' | 'low' | 'ok' | 'na', RiskTone> = {
  high: { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c', label: '高风险', dot: '#dc2626' },
  med: { bg: '#fffbeb', border: '#fde68a', text: '#b45309', label: '中风险', dot: '#f59e0b' },
  low: { bg: '#f8fafc', border: '#e2e8f0', text: '#475569', label: '低风险', dot: '#94a3b8' },
  ok: { bg: '#ecfdf5', border: '#a7f3d0', text: '#047857', label: '正常', dot: '#10b981' },
  na: { bg: '#f5f3ff', border: '#ddd6fe', text: '#5b21b6', label: '数据不足', dot: '#a78bfa' },
}
