import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { CategoriesCard } from './categories-card'

const mockData = {
    sector: [
        { name: 'Technology', value: 1000 },
        { name: 'Financial', value: 500 },
        { name: 'Healthcare', value: 200 },
    ],
    asset: [
        { name: 'Stock', value: 2000 },
    ],
    geo: [],
    ticker: []
}

describe('CategoriesCard', () => {
    it('renders loading state when no data provided', () => {
        render(<CategoriesCard data={undefined as any} />)
        expect(screen.getByText('Loading data...')).toBeInTheDocument()
    })

    it('renders sector tab by default and shows correct data', () => {
        render(<CategoriesCard data={mockData} />)

        // Check Header
        expect(screen.getByText('Portfolio Allocation')).toBeInTheDocument()
        expect(screen.getByText('Breakdown by sector')).toBeInTheDocument() // sector is default tab

        // Check List Items
        expect(screen.getByText('Technology')).toBeInTheDocument()
        expect(screen.getByText('$1,000')).toBeInTheDocument()

        // 1700 total. 1000/1700 = 58.8%
        expect(screen.getByText('58.8%')).toBeInTheDocument()
    })

    it('switches tabs correctly', () => {
        render(<CategoriesCard data={mockData} />)

        const assetTab = screen.getByRole('button', { name: /asset/i })
        fireEvent.click(assetTab)

        // Title should update (based on component logic "Breakdown by asset")
        // Wait, the component updates "Breakdown by {activeTab}"
        expect(screen.getByText('Breakdown by asset')).toBeInTheDocument()

        // Should show Asset data
        expect(screen.getByText('Stock')).toBeInTheDocument()
        expect(screen.getByText('$2,000')).toBeInTheDocument()
    });

    it('handles "Others" grouping for small values', () => {
        const dataWithSmallItems = {
            sector: [
                { name: 'Big', value: 10000 },
                { name: 'Tiny', value: 1 }, // 1/10001 < 0.001
            ]
        }
        render(<CategoriesCard data={dataWithSmallItems} />)

        expect(screen.getByText('Big')).toBeInTheDocument()
        // "Tiny" should be grouped into "Others" or filtered out if we check the logic
        // Logic: if <= 0.001, goes to Others.
        expect(screen.queryByText('Tiny')).not.toBeInTheDocument()
        expect(screen.getByText('Others')).toBeInTheDocument()
    })
})
