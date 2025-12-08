import '@testing-library/jest-dom'
import { vi } from 'vitest'
import React from 'react'

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
    observe() { }
    unobserve() { }
    disconnect() { }
};

// Mock Recharts ResponsiveContainer to just render children
// This often solves issues where charts don't render in jsdom because they have 0 dimensions
vi.mock('recharts', async (importOriginal) => {
    const original = await importOriginal<typeof import('recharts')>()
    return {
        ...original,
        ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
            <div style={{ width: 500, height: 500 }
            }> {children} </div>
        ),
    }
})
