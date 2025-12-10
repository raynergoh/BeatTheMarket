import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface VerificationData {
    date: string;
    portfolioValue: number;
    benchmarkValue: number;
    totalInvested: number;
}

interface DepositDebug {
    date: string;
    amount: number;
    originalAmount?: number;
    currency?: string;
    description: string;
    type: string;
    transactionId?: string;
}

interface DataVerificationDialogProps {
    data: VerificationData[];
    deposits?: DepositDebug[];
    currencySymbol?: string;
    targetCurrency?: string;
}

export function DataVerificationDialog({
    data,
    deposits = [],
    currencySymbol = '$',
    targetCurrency = 'USD'
}: DataVerificationDialogProps) {
    const handleCopy = () => {
        // Convert to CSV
        const header = "Date,Portfolio Value,Benchmark Value,Net Deposits\n";
        const rows = data.map(row =>
            `${row.date},${row.portfolioValue},${row.benchmarkValue},${row.totalInvested}`
        ).join("\n");
        const csv = header + rows;
        navigator.clipboard.writeText(csv);
        alert("Copied Performance Data to clipboard!");
    };

    const handleCopyDeposits = () => {
        const header = "Date,Amount,Original Amount,Currency,Type,Description\n";
        const rows = deposits.map(d =>
            `${d.date},${d.amount},${d.originalAmount || ''},${d.currency || 'USD'},${d.type},"${d.description}"`
        ).join("\n");
        const csv = header + rows;
        navigator.clipboard.writeText(csv);
        alert("Copied Deposits Data to clipboard!");
    }

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">Verify Data</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-6xl w-full max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Data Verification Inspector</DialogTitle>
                </DialogHeader>

                <Tabs defaultValue="performance" className="w-full">
                    <TabsList>
                        <TabsTrigger value="performance">Performance & NAV</TabsTrigger>
                        <TabsTrigger value="deposits">Detected Deposits ({deposits.length})</TabsTrigger>
                    </TabsList>

                    <TabsContent value="performance">
                        <div className="flex justify-end mb-2">
                            <Button variant="ghost" size="sm" onClick={handleCopy}>
                                <Copy className="w-4 h-4 mr-2" />
                                Copy CSV
                            </Button>
                        </div>
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead className="text-right">Portfolio Value ({targetCurrency})</TableHead>
                                        <TableHead className="text-right">Benchmark (SPY) ({targetCurrency})</TableHead>
                                        <TableHead className="text-right">Net Deposits ({targetCurrency})</TableHead>
                                        <TableHead className="text-right">Difference</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.map((row) => (
                                        <TableRow key={row.date}>
                                            <TableCell>{row.date}</TableCell>
                                            <TableCell className="text-right">
                                                {currencySymbol}{row.portfolioValue?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {currencySymbol}{row.benchmarkValue?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {currencySymbol}{row.totalInvested?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </TableCell>
                                            <TableCell className="text-right text-muted-foreground text-xs">
                                                {currencySymbol}{((row.portfolioValue || 0) - row.benchmarkValue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </TabsContent>

                    <TabsContent value="deposits">
                        <div className="flex justify-end mb-2">
                            <Button variant="ghost" size="sm" onClick={handleCopyDeposits}>
                                <Copy className="w-4 h-4 mr-2" />
                                Copy CSV
                            </Button>
                        </div>
                        <p className="text-sm text-muted-foreground mb-4">
                            These are the transactions interpreted as "Capital Deposits". If you see internal transfers here, that's why your Net Deposits are too high.
                        </p>
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>{targetCurrency} Amount</TableHead>
                                        <TableHead>Original</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Description</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {deposits.map((d, i) => (
                                        <TableRow key={i}>
                                            <TableCell>{d.date}</TableCell>
                                            <TableCell className="font-medium text-green-600">
                                                {currencySymbol}{d.amount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {d.originalAmount && d.currency && d.currency !== targetCurrency ? (
                                                    `${d.originalAmount.toLocaleString()} ${d.currency}`
                                                ) : '-'}
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground">{d.type}</TableCell>
                                            <TableCell className="text-xs truncate max-w-[300px]" title={d.description}>{d.description}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
