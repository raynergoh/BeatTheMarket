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
    originalCurrency?: string;
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
                    <DialogTitle className="text-base sm:text-lg">Data Verification</DialogTitle>
                </DialogHeader>

                <Tabs defaultValue="performance" className="w-full">
                    <TabsList className="w-full">
                        <TabsTrigger value="performance" className="text-xs sm:text-sm flex-1">Performance & NAV</TabsTrigger>
                        <TabsTrigger value="deposits" className="text-xs sm:text-sm flex-1">Deposits ({deposits.length})</TabsTrigger>
                    </TabsList>

                    <TabsContent value="performance">
                        <div className="flex justify-end mb-2">
                            <Button variant="ghost" size="sm" onClick={handleCopy}>
                                <Copy className="w-4 h-4 mr-2" />
                                Copy CSV
                            </Button>
                        </div>
                        <div className="rounded-md border overflow-hidden">
                            <Table className="text-[10px] xs:text-xs sm:text-sm w-full table-fixed">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[75px] xs:w-[85px]">Date</TableHead>
                                        <TableHead className="text-right">Portfolio</TableHead>
                                        <TableHead className="text-right hidden xs:table-cell">Benchmark</TableHead>
                                        <TableHead className="text-right">Deposits</TableHead>
                                        <TableHead className="text-right hidden sm:table-cell">Diff</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.map((row) => (
                                        <TableRow key={row.date}>
                                            <TableCell>{row.date}</TableCell>
                                            <TableCell className="text-right">
                                                {currencySymbol}{row.portfolioValue?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                            </TableCell>
                                            <TableCell className="text-right hidden xs:table-cell">
                                                {currencySymbol}{row.benchmarkValue?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {currencySymbol}{row.totalInvested?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                            </TableCell>
                                            <TableCell className="text-right text-muted-foreground hidden sm:table-cell">
                                                {currencySymbol}{((row.portfolioValue || 0) - row.benchmarkValue).toLocaleString(undefined, { maximumFractionDigits: 0 })}
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
                            These are the transactions interpreted as "Capital Deposits/Withdrawals". Internal transfers between tracked accounts will appear as offsetting entries.
                        </p>
                        <div className="rounded-md border overflow-hidden">
                            <Table className="text-[10px] xs:text-xs sm:text-sm w-full table-fixed">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[75px] xs:w-[85px]">Date</TableHead>
                                        <TableHead className="pl-4 sm:pl-8 md:pl-16">Amount</TableHead>
                                        <TableHead>Original</TableHead>
                                        <TableHead className="hidden sm:table-cell">Type</TableHead>
                                        <TableHead className="hidden md:table-cell">Description</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {deposits.map((d, i) => (
                                        <TableRow key={i}>
                                            <TableCell>{d.date}</TableCell>
                                            <TableCell className={`pl-4 sm:pl-8 md:pl-16 font-medium ${d.amount < 0 ? "text-red-500" : "text-green-600"}`}>
                                                {currencySymbol}{d.amount?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {d.originalAmount ? (
                                                    `${d.originalAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${d.originalCurrency || d.currency || ''}`
                                                ) : '-'}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground hidden sm:table-cell truncate">{d.type}</TableCell>
                                            <TableCell className="truncate hidden md:table-cell" title={d.description}>{d.description}</TableCell>
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
