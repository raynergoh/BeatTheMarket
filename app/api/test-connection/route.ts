import { NextResponse } from 'next/server';
import { fetchFlexReport } from '@/lib/ibkr/api';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { token, queryId } = body;

        if (!token || !queryId) {
            return NextResponse.json(
                { error: 'Token and Query ID are required' },
                { status: 400 }
            );
        }

        // Attempt to fetch the report. 
        // fetchFlexReport handles the "Statement generation in progress" retry logic.
        await fetchFlexReport(token, queryId);

        return NextResponse.json({ success: true, message: "Connection successful! Report retrieved." });

    } catch (error: any) {
        console.error('Test Connection Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to connect to IBKR.' },
            { status: 400 }
        );
    }
}
