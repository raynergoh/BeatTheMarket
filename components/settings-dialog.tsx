"use client"

import { useState, useEffect } from "react"
import { Settings, Loader2, CheckCircle2, XCircle, ChevronLeft, ExternalLink, FileText, HelpCircle, RefreshCw, Trash2, Lightbulb, AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion"
import { FileUploader } from "@/components/file-uploader"
import { parseFlexReport } from "@/src/core/parser"

interface SettingsDialogProps {
    onSettingsChanged?: () => void
}

type ViewState = 'selection' | 'ibkr' | 'moomoo' | 'tiger' | 'syfe' | 'webull';

export function SettingsDialog({ onSettingsChanged }: SettingsDialogProps) {
    const [open, setOpen] = useState(false)
    const [view, setView] = useState<ViewState>('selection')

    // IBKR State
    const [token, setToken] = useState("")
    const [queryId, setQueryId] = useState("")
    const [manualFiles, setManualFiles] = useState<any[]>([])

    // Test Connection State
    const [testing, setTesting] = useState(false)
    const [testStatus, setTestStatus] = useState<'idle' | 'success' | 'error'>('idle')
    const [testMessage, setTestMessage] = useState("")

    useEffect(() => {
        if (open) {
            const savedToken = localStorage.getItem("ibkr_token")
            const savedQueryId = localStorage.getItem("ibkr_query_id")
            const manualHistory = localStorage.getItem("ibkr_manual_history")
            if (savedToken) setToken(savedToken)
            if (savedQueryId) setQueryId(savedQueryId)
            if (manualHistory) {
                try {
                    const parsed = JSON.parse(manualHistory)
                    setManualFiles(parsed || [])
                } catch (e) {
                    setManualFiles([])
                }
            }
        }
    }, [open])

    const handleSave = () => {
        localStorage.setItem("ibkr_token", token)
        localStorage.setItem("ibkr_query_id", queryId)
        localStorage.setItem("ibkr_manual_history", JSON.stringify(manualFiles))
        setOpen(false)
        if (onSettingsChanged) {
            onSettingsChanged()
        }
    }

    const handleTestConnection = async () => {
        setTesting(true)
        setTestStatus('idle')
        setTestMessage("")

        try {
            const res = await fetch('/api/test-connection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, queryId })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Connection failed');
            }

            setTestStatus('success')
        } catch (err: any) {
            setTestStatus('error')
            setTestMessage(err.message)
        } finally {
            setTesting(false)
        }
    }

    const handleFilesSelected = async (files: File[]) => {
        let allParsedData: any[] = []
        let successCount = 0;
        let skippedFiles: string[] = []

        // Get existing filenames
        const existingNames = new Set(manualFiles.map(f => f.fileName));

        for (const file of files) {
            if (existingNames.has(file.name)) {
                skippedFiles.push(file.name);
                continue;
            }

            const text = await file.text()
            try {
                const parsed = parseFlexReport(text)
                allParsedData.push({
                    fileName: file.name,
                    accountId: parsed.accountId,    // CRITICAL: Must include this for deterministic merging
                    cashTransactions: parsed.cashTransactions,
                    equitySummary: parsed.equitySummary,
                    openPositions: parsed.openPositions,
                    cashReports: parsed.cashReports,
                    transfers: parsed.transfers,
                    baseCurrency: parsed.baseCurrency,
                    fromDate: parsed.fromDate,
                    toDate: parsed.toDate
                })
                successCount++;
            } catch (err: any) {
                console.error(`Failed to parse ${file.name}:`, err)
                toast.error(`Failed to parse ${file.name}`, { description: err.message });
            }
        }

        if (allParsedData.length > 0) {
            // Append new files to the current state (which reflects any deletions made in this session)
            const combined = [...manualFiles, ...allParsedData];
            setManualFiles(combined)

            const totalTrans = combined.reduce((acc, f) => acc + (f.cashTransactions?.length || 0), 0);
            const totalEquity = combined.reduce((acc, f) => acc + (f.equitySummary?.length || 0), 0);
            const totalPos = combined.reduce((acc, f) => acc + (f.openPositions?.length || 0), 0);

            toast.success(`Successfully processed ${successCount} file(s)`, {
                description: `Found:\n- ${totalTrans} Cash Transactions\n- ${totalEquity} Equity/NAV Records\n- ${totalPos} Open Positions`,
                duration: 5000,
            });

            if (skippedFiles.length > 0) {
                toast.warning("Duplicate file(s) skipped", {
                    description: `Already uploaded: ${skippedFiles.join(', ')}`
                });
            }
        } else if (skippedFiles.length > 0) {
            toast.warning("Duplicate file(s) skipped", {
                description: `Already uploaded: ${skippedFiles.join(', ')}`
            });
        }
    }

    const handleRemoveFile = (index: number) => {
        const newFiles = [...manualFiles]
        newFiles.splice(index, 1)
        setManualFiles(newFiles)
    }

    // Reset view when dialog opens/closes
    useEffect(() => {
        if (!open) {
            // Delay slightly so user doesn't see flicker on close
            const t = setTimeout(() => setView('selection'), 300);
            return () => clearTimeout(t);
        }
    }, [open])

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="h-8 px-2 gap-2">
                    <RefreshCw className="h-4 w-4" />
                    <span className="hidden sm:inline">Sync Data</span>
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[1000px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    {view === 'selection' ? (
                        <>
                            <DialogTitle>Select Broker</DialogTitle>
                            <DialogDescription>
                                Choose your broker to configure integration.
                            </DialogDescription>
                        </>
                    ) : (
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" size="icon" className="h-8 w-8 -ml-2" onClick={() => setView('selection')}>
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <div>
                                <DialogTitle>{view === 'ibkr' ? 'Interactive Brokers' : view === 'moomoo' ? 'Moomoo' : view === 'tiger' ? 'Tiger Brokers' : 'Syfe'}</DialogTitle>
                                <DialogDescription>
                                    {view === 'ibkr' ? 'Configure API and history.' : 'Coming soon.'}
                                </DialogDescription>
                            </div>
                        </div>
                    )}
                </DialogHeader>

                {view === 'selection' && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4 py-1">
                        <Button
                            variant="outline"
                            className="h-32 sm:h-60 flex flex-col items-center justify-center gap-2 sm:gap-4 hover:border-primary/50 transition-colors"
                            onClick={() => setView('ibkr')}
                        >
                            <div className="relative w-16 h-16 sm:w-32 sm:h-32 rounded-2xl sm:rounded-3xl overflow-hidden border bg-background shrink-0 shadow-sm">
                                <Image src="/images/brokers/ibkr-icon.png" alt="IBKR" fill className="object-cover" />
                            </div>
                            <span className="font-semibold text-sm sm:text-xl">IBKR</span>
                        </Button>

                        <Button
                            variant="outline"
                            className="h-32 sm:h-60 flex flex-col items-center justify-center gap-2 sm:gap-4 opacity-80"
                            onClick={() => setView('moomoo')}
                        >
                            <div className="relative w-16 h-16 sm:w-32 sm:h-32 rounded-2xl sm:rounded-3xl overflow-hidden border bg-background shrink-0 shadow-sm">
                                <Image src="/images/brokers/moomoo-icon.png" alt="Moomoo" fill className="object-cover" />
                            </div>
                            <span className="font-semibold text-sm sm:text-xl">Moomoo</span>
                        </Button>

                        <Button
                            variant="outline"
                            className="h-32 sm:h-60 flex flex-col items-center justify-center gap-2 sm:gap-4 opacity-80"
                            onClick={() => setView('tiger')}
                        >
                            <div className="relative w-16 h-16 sm:w-32 sm:h-32 rounded-2xl sm:rounded-3xl overflow-hidden border bg-background shrink-0 shadow-sm">
                                <Image src="/images/brokers/tiger-icon.png" alt="Tiger" fill className="object-cover" />
                            </div>
                            <span className="font-semibold text-sm sm:text-xl">Tiger</span>
                        </Button>

                        <Button
                            variant="outline"
                            className="h-32 sm:h-60 flex flex-col items-center justify-center gap-2 sm:gap-6 hover:border-primary hover:bg-muted/50 transition-all text-center"
                            onClick={() => setView('syfe')}
                        >
                            <div className="relative w-16 h-16 sm:w-32 sm:h-32 rounded-2xl sm:rounded-3xl overflow-hidden border bg-background shrink-0 shadow-sm">
                                <Image src="/images/brokers/syfe-icon.png" alt="Syfe" fill className="object-cover" />
                            </div>
                            <span className="font-semibold text-sm sm:text-xl">Syfe</span>
                        </Button>

                        <Button
                            variant="outline"
                            className="h-32 sm:h-60 flex flex-col items-center justify-center gap-2 sm:gap-6 hover:border-primary hover:bg-muted/50 transition-all text-center"
                            onClick={() => setView('webull')}
                        >
                            <div className="relative w-16 h-16 sm:w-32 sm:h-32 rounded-2xl sm:rounded-3xl overflow-hidden border bg-background shrink-0 shadow-sm">
                                <Image src="/images/brokers/webull-icon.png" alt="Webull" fill className="object-cover" />
                            </div>
                            <span className="font-semibold text-sm sm:text-xl">Webull</span>
                        </Button>
                    </div>
                )}

                {(view === 'moomoo' || view === 'tiger') && (
                    <div className="h-[400px] flex flex-col items-center justify-center text-center space-y-4">
                        <div className="bg-primary/10 p-4 rounded-full">
                            <Settings className="h-8 w-8 text-primary" />
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-xl font-semibold">Integration Coming Soon</h3>
                            <p className="text-muted-foreground max-w-xs mx-auto">
                                We're working on adding support for {view === 'moomoo' ? 'Moomoo' : 'Tiger Brokers'}. Check back later for updates!
                            </p>
                        </div>
                        <Button variant="outline" onClick={() => setView('selection')}>Go Back</Button>
                    </div>
                )}

                {view === 'syfe' && (
                    <div className="h-[400px] flex flex-col items-center justify-center text-center space-y-4">
                        <div className="relative w-24 h-24 rounded-2xl overflow-hidden border bg-background shrink-0 shadow-sm">
                            <Image src="/images/brokers/syfe-icon.png" alt="Syfe" fill className="object-cover" />
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-xl font-semibold">Syfe Integration Coming Soon</h3>
                            <p className="text-muted-foreground max-w-xs mx-auto">
                                We're working on adding support for Syfe. Check back later for updates!
                            </p>
                        </div>
                        <Button variant="outline" onClick={() => setView('selection')}>Go Back</Button>
                    </div>
                )}

                {view === 'webull' && (
                    <div className="h-[400px] flex flex-col items-center justify-center text-center space-y-4">
                        <div className="relative w-24 h-24 rounded-2xl overflow-hidden border bg-background shrink-0 shadow-sm">
                            <Image src="/images/brokers/webull-icon.png" alt="Webull" fill className="object-cover" />
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-xl font-semibold">Webull Integration Coming Soon</h3>
                            <p className="text-muted-foreground max-w-xs mx-auto">
                                We're working on adding support for Webull. Check back later for updates!
                            </p>
                        </div>
                        <Button variant="outline" onClick={() => setView('selection')}>Go Back</Button>
                    </div>
                )}

                {view === 'ibkr' && (
                    <Tabs defaultValue="api" className="w-full animated-fade-in">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="api" className="text-xs sm:text-sm px-1 sm:px-3">Auto-Sync</TabsTrigger>
                            <TabsTrigger value="history" className="text-xs sm:text-sm px-1 sm:px-3">Manual Upload</TabsTrigger>
                        </TabsList>

                        <TabsContent value="api" className="space-y-4 pt-4">
                            <div className="bg-yellow-500/15 text-yellow-600 dark:text-yellow-500 border-yellow-500/20 border p-3 rounded-md text-sm flex items-start gap-2">
                                <AlertTriangle className="h-5 w-5 shrink-0" />
                                <div className="space-y-1">
                                    <p>
                                        <strong>LIMITATION:</strong> Auto-sync via Flex Query can only retrieve data for the <strong>last 365 days</strong>.
                                        For older history, please use the <strong>Manual Upload</strong> tab.
                                    </p>
                                    <p className="text-xs">
                                        Need help? <a href="https://www.ibkrguides.com/orgportal/performanceandstatements/flex.htm" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">View official IBKR guide</a>.
                                    </p>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="token" className="text-right">Token</Label>
                                    <Input
                                        id="token"
                                        value={token}
                                        onChange={(e) => setToken(e.target.value)}
                                        className="col-span-3"
                                        type="password"
                                        placeholder="Enter Flex Query Token"
                                    />
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="queryId" className="text-right">Query ID</Label>
                                    <Input
                                        id="queryId"
                                        value={queryId}
                                        onChange={(e) => setQueryId(e.target.value)}
                                        className="col-span-3"
                                        placeholder="e.g. 123456"
                                    />
                                </div>

                                {/* Test Connection Section */}
                                <div className="flex flex-col gap-2 ml-[25%]">
                                    <div className="flex items-center gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={handleTestConnection}
                                            disabled={testing || !token || !queryId}
                                        >
                                            {testing && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                                            Test Connection
                                        </Button>

                                        {testStatus === 'success' && (
                                            <span className="text-green-600 flex items-center gap-1 text-sm font-medium">
                                                <CheckCircle2 className="h-4 w-4" /> Success
                                            </span>
                                        )}

                                        {testStatus === 'error' && (
                                            <span className="text-red-600 flex items-center gap-1 text-sm font-medium">
                                                <XCircle className="h-4 w-4" /> Failed
                                            </span>
                                        )}
                                    </div>
                                    {testStatus === 'error' && testMessage && (
                                        <p className="text-xs text-red-500 bg-red-50 p-2 rounded">{testMessage}</p>
                                    )}
                                </div>
                            </div>

                            <Accordion type="single" collapsible className="w-full bg-muted/50 rounded-md px-4">
                                <AccordionItem value="setup-guide" className="border-b-0">
                                    <AccordionTrigger className="text-sm font-medium">
                                        <div className="flex items-center gap-2">
                                            <HelpCircle className="h-4 w-4" />
                                            How to get your Token & Query ID
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="text-sm text-muted-foreground pb-4">
                                        <div className="space-y-6 pt-2">
                                            <div className="bg-muted/50 p-4 rounded-lg flex flex-col md:flex-row gap-6 items-start">
                                                <div className="space-y-4 flex-1">
                                                    <div>
                                                        <p className="font-medium text-foreground">Step 1: Navigate to Flex Queries</p>
                                                        <p>Log in to <strong>IBKR Portal</strong>. Go to <strong>Performance & Reports</strong> &gt; <strong>Flex Queries</strong>.</p>
                                                    </div>
                                                    <div className="flex gap-2 items-start text-xs bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 p-3 rounded border border-zinc-500/20">
                                                        <AlertTriangle className="w-4 h-4 shrink-0" />
                                                        <p>
                                                            Flex Queries are only available on the <strong>Web Portal</strong>. You cannot configure this feature using the mobile app.
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="bg-background rounded overflow-hidden shrink-0 w-full md:w-64 border">
                                                    <Image src="/images/guides/ibkr/ibkr-step-1-menu-light.png" alt="Navigate to Flex Queries" width={0} height={0} sizes="100vw" className="w-full h-auto dark:hidden" />
                                                    <Image src="/images/guides/ibkr/ibkr-step-1-menu-dark.png" alt="Navigate to Flex Queries" width={0} height={0} sizes="100vw" className="w-full h-auto hidden dark:block" />
                                                </div>
                                            </div>

                                            <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                                                <p className="font-medium text-foreground">Step 2: Create Activity Flex Query</p>
                                                <p>Click the <strong>+ (Plus)</strong> icon next to <strong>Activity Flex Query</strong> to create a new one.</p>
                                                <div className="bg-background rounded overflow-hidden mt-2">
                                                    <Image src="/images/guides/ibkr/ibkr-step-2-create-light.png" alt="Create Activity Flex Query" width={0} height={0} sizes="100vw" className="w-full h-auto dark:hidden" />
                                                    <Image src="/images/guides/ibkr/ibkr-step-2-create-dark.png" alt="Create Activity Flex Query" width={0} height={0} sizes="100vw" className="w-full h-auto hidden dark:block" />
                                                </div>
                                            </div>

                                            <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                                                <p className="font-medium text-foreground">Step 3: Select Sections</p>
                                                <p>Enable the following sections and check <strong>Select All</strong> for each:</p>
                                                <ul className="list-disc pl-4 space-y-1 text-xs grid grid-cols-2 gap-x-4">
                                                    <li><strong>Cash Report</strong></li>
                                                    <li><strong>Cash Transactions</strong></li>
                                                    <li><strong>NAV in Base</strong></li>
                                                    <li><strong>Open Positions</strong></li>
                                                    <li><strong>Transfers</strong></li>
                                                    <li><strong>Financial Instrument Information</strong></li>
                                                </ul>
                                                <div className="grid grid-cols-2 gap-2 mt-2">
                                                    <div className="bg-background rounded overflow-hidden border">
                                                        <Image src="/images/guides/ibkr/ibkr-step-3-sections-1-light.png" alt="Sections Part 1" width={0} height={0} sizes="100vw" className="w-full h-auto dark:hidden" />
                                                        <Image src="/images/guides/ibkr/ibkr-step-3-sections-1-dark.png" alt="Sections Part 1" width={0} height={0} sizes="100vw" className="w-full h-auto hidden dark:block" />
                                                    </div>
                                                    <div className="bg-background rounded overflow-hidden border">
                                                        <Image src="/images/guides/ibkr/ibkr-step-3-sections-2-light.png" alt="Sections Part 2" width={0} height={0} sizes="100vw" className="w-full h-auto dark:hidden" />
                                                        <Image src="/images/guides/ibkr/ibkr-step-3-sections-2-dark.png" alt="Sections Part 2" width={0} height={0} sizes="100vw" className="w-full h-auto hidden dark:block" />
                                                    </div>
                                                    <div className="bg-background rounded overflow-hidden border">
                                                        <Image src="/images/guides/ibkr/ibkr-step-3-sections-3-light.png" alt="Sections Part 3" width={0} height={0} sizes="100vw" className="w-full h-auto dark:hidden" />
                                                        <Image src="/images/guides/ibkr/ibkr-step-3-sections-3-dark.png" alt="Sections Part 3" width={0} height={0} sizes="100vw" className="w-full h-auto hidden dark:block" />
                                                    </div>
                                                    <div className="bg-background rounded overflow-hidden border">
                                                        <Image src="/images/guides/ibkr/ibkr-step-3-sections-4-light.png" alt="Sections Part 4" width={0} height={0} sizes="100vw" className="w-full h-auto dark:hidden" />
                                                        <Image src="/images/guides/ibkr/ibkr-step-3-sections-4-dark.png" alt="Sections Part 4" width={0} height={0} sizes="100vw" className="w-full h-auto hidden dark:block" />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                                                <p className="font-medium text-foreground">Step 4: Configure Settings</p>
                                                <p>Set Format to <strong>XML</strong> and Period to <strong>Last 365 Days</strong>. Save the query.</p>
                                                <div className="bg-background rounded overflow-hidden mt-2">
                                                    <Image src="/images/guides/ibkr/ibkr-step-4-settings-light.png" alt="Configure Settings" width={0} height={0} sizes="100vw" className="w-full h-auto dark:hidden" />
                                                    <Image src="/images/guides/ibkr/ibkr-step-4-settings-dark.png" alt="Configure Settings" width={0} height={0} sizes="100vw" className="w-full h-auto hidden dark:block" />
                                                </div>
                                            </div>

                                            <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                                                <p className="font-medium text-foreground">Step 5: Retrieve Query ID</p>
                                                <p>Back on the main <strong>Flex Queries</strong> page, expand your new query (click <strong>Edit</strong>) to reveal the <strong>Query ID</strong>.</p>
                                                <div className="grid grid-cols-1 gap-2 mt-2">
                                                    <div className="bg-background rounded overflow-hidden">
                                                        <Image src="/images/guides/ibkr/ibkr-step-5-find-id-1-list-light.png" alt="Find Query in List" width={0} height={0} sizes="100vw" className="w-full h-auto dark:hidden" />
                                                        <Image src="/images/guides/ibkr/ibkr-step-5-find-id-1-list-dark.png" alt="Find Query in List" width={0} height={0} sizes="100vw" className="w-full h-auto hidden dark:block" />
                                                    </div>
                                                    <div className="bg-background rounded overflow-hidden">
                                                        <Image src="/images/guides/ibkr/ibkr-step-5-find-id-2-details-light.png" alt="View Query Details" width={0} height={0} sizes="100vw" className="w-full h-auto dark:hidden" />
                                                        <Image src="/images/guides/ibkr/ibkr-step-5-find-id-2-details-dark.png" alt="View Query Details" width={0} height={0} sizes="100vw" className="w-full h-auto hidden dark:block" />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                                                <p className="font-medium text-foreground">Step 6: Configure Flex Web Service</p>
                                                <p>On the main Flex Queries page, click the <strong>Gear Icon</strong> next to <strong>Flex Web Service Configuration</strong>.</p>
                                                <div className="bg-background rounded overflow-hidden mt-2">
                                                    <Image src="/images/guides/ibkr/ibkr-step-6-config-light.png" alt="Configure Flex Web Service" width={0} height={0} sizes="100vw" className="w-full h-auto dark:hidden" />
                                                    <Image src="/images/guides/ibkr/ibkr-step-6-config-dark.png" alt="Configure Flex Web Service" width={0} height={0} sizes="100vw" className="w-full h-auto hidden dark:block" />
                                                </div>
                                            </div>

                                            <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                                                <p className="font-medium text-foreground">Step 7: Generate Token</p>
                                                <p>Enable the service (if disabled), generate a new token, and copy it.</p>
                                                <div className="bg-background rounded overflow-hidden mt-2">
                                                    <Image src="/images/guides/ibkr/ibkr-step-7-token-light.png" alt="Generate Token" width={0} height={0} sizes="100vw" className="w-full h-auto dark:hidden" />
                                                    <Image src="/images/guides/ibkr/ibkr-step-7-token-dark.png" alt="Generate Token" width={0} height={0} sizes="100vw" className="w-full h-auto hidden dark:block" />
                                                </div>
                                            </div>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            </Accordion>
                        </TabsContent>

                        <TabsContent value="history" className="space-y-4 pt-4">
                            <div className="text-sm text-muted-foreground mb-4">
                                <p className="mb-2">
                                    Use this to upload historical data <strong>older than 365 days</strong>, or if you prefer not to use the auto-sync API.
                                </p>
                                <Accordion type="single" collapsible className="bg-muted/50 rounded-md px-4 mb-4">
                                    <AccordionItem value="manual-guide" className="border-b-0">
                                        <AccordionTrigger className="text-sm">
                                            How to generate the XML file manually?
                                        </AccordionTrigger>
                                        <AccordionContent className="pb-4">
                                            <div className="space-y-6 pt-2">
                                                <div className="bg-muted/50 p-4 rounded-lg space-y-3">
                                                    <div className="flex justify-between items-start">
                                                        <p className="font-medium text-foreground">Step 1: Setup Activity Flex Query</p>
                                                        <a href="https://www.ibkrguides.com/orgportal/performanceandstatements/activityflex.htm" target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-0.5">
                                                            Official Guide<ExternalLink className="h-3 w-3" />
                                                        </a>
                                                    </div>
                                                    <p>Follow the steps in the <strong>Auto-Sync</strong> tab to create an <strong>Activity Flex Query</strong> with:</p>
                                                    <ul className="list-disc pl-4 text-xs space-y-1">
                                                        <li>Format: <strong>XML</strong></li>
                                                        <li>Sections:
                                                            <ul className="list-disc pl-4 mt-1 space-y-0.5">
                                                                <li><strong>Cash Report</strong></li>
                                                                <li><strong>Cash Transactions</strong></li>
                                                                <li><strong>NAV in Base</strong></li>
                                                                <li><strong>Open Positions</strong></li>
                                                                <li><strong>Transfers</strong></li>
                                                                <li><strong>Financial Instrument Information</strong></li>
                                                            </ul>
                                                        </li>
                                                    </ul>

                                                    {/* Important Rules Section */}
                                                    <div className="bg-red-500/5 border border-red-500/20 p-3 rounded-lg space-y-2 mt-3">
                                                        <p className="font-medium text-foreground flex items-center gap-2 text-xs">
                                                            <AlertTriangle className="w-4 h-4 text-red-500" />
                                                            Important Rules
                                                        </p>

                                                        {/* Strict File Structure Warning */}
                                                        <div className="flex gap-2 items-start text-xs bg-red-500/10 text-red-600 dark:text-red-400 p-2 rounded border border-red-500/20">
                                                            <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                                            <p><strong>One Statement Per File:</strong> Do not generate a single XML file containing multiple Flex Statements. Each time period or account must be a <strong>separate download</strong>.</p>
                                                        </div>

                                                        {/* Asset Support */}
                                                        <div className="flex gap-2 items-start text-xs bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 p-2 rounded border border-zinc-500/20">
                                                            <HelpCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                                            <p><strong>Supported Assets:</strong> Stocks, ETFs, and Single-Leg Options. <em>Complex derivatives (Futures, FOPs, Multi-leg strategies) are not fully supported.</em></p>
                                                        </div>

                                                        {/* Multi-File Logic */}
                                                        <div className="space-y-1.5">
                                                            <p className="text-xs text-muted-foreground font-medium">When to upload multiple files:</p>
                                                            <ul className="text-xs text-muted-foreground space-y-1 ml-1">
                                                                <li className="flex gap-2 items-start">
                                                                    <span className="text-primary font-bold">•</span>
                                                                    <span><strong>Combine Accounts:</strong> Upload files from different sub-accounts for the same time frame.</span>
                                                                </li>
                                                                <li className="flex gap-2 items-start">
                                                                    <span className="text-primary font-bold">•</span>
                                                                    <span><strong>Extend History:</strong> Upload files for the same account covering different time periods (e.g., <code className="bg-muted px-1 rounded">2023.xml</code>, <code className="bg-muted px-1 rounded">2024.xml</code>).</span>
                                                                </li>
                                                            </ul>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                                                    <p className="font-medium text-foreground">Step 2: Run the Query Manually</p>
                                                    <p>Find your saved query in the list and click the <strong>Run</strong> button (arrow icon).</p>
                                                    <div className="flex gap-2 items-start text-xs bg-muted text-muted-foreground p-3 rounded mt-2">
                                                        <Lightbulb className="w-4 h-4 shrink-0 text-yellow-500" />
                                                        <p><strong>Tip:</strong> We recommend creating separate Flex Queries matching calendar years (e.g., "2023", "2024") to keep your history organized.</p>
                                                    </div>
                                                    <div className="bg-background rounded overflow-hidden mt-2">
                                                        <Image src="/images/guides/ibkr/ibkr-manual-step-2-run-light.png" alt="Run Query" width={0} height={0} sizes="100vw" className="w-full h-auto dark:hidden" />
                                                        <Image src="/images/guides/ibkr/ibkr-manual-step-2-run-dark.png" alt="Run Query" width={0} height={0} sizes="100vw" className="w-full h-auto hidden dark:block" />
                                                    </div>
                                                </div>

                                                <div className="bg-muted/50 p-4 rounded-lg space-y-3">
                                                    <p className="font-medium text-foreground">Step 3: Select Date Range</p>
                                                    <p>Select <strong>Custom Date Range</strong>. Choose a full year (e.g., Jan 1 - Dec 31) to capture historical data.</p>

                                                    {/* Date Gap Warning - Grey */}
                                                    <div className="flex gap-2 items-start text-xs bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 p-3 rounded border border-zinc-500/20">
                                                        <HelpCircle className="w-4 h-4 shrink-0" />
                                                        <p><strong>Note:</strong> Ensure there are <strong>no significant gaps</strong> in your date ranges across files. It is okay if files have <strong>overlapping dates</strong>; the system will handle duplicates automatically.</p>
                                                    </div>

                                                    {/* Weekend Tip - Yellow */}
                                                    <div className="flex gap-2 items-start text-xs bg-yellow-500/10 text-yellow-600 dark:text-yellow-500 p-3 rounded border border-yellow-500/20">
                                                        <AlertTriangle className="w-4 h-4 shrink-0" />
                                                        <p><strong>Tip:</strong> Since IBKR only logs activity on weekdays, it is normal if your files don't start exactly on Jan 1 or end on Dec 31 if those dates fall on a weekend.</p>
                                                    </div>

                                                    <div className="bg-background rounded overflow-hidden">
                                                        <Image src="/images/guides/ibkr/ibkr-manual-step-3-date-range-light.png" alt="Select Date Range" width={0} height={0} sizes="100vw" className="w-full h-auto dark:hidden" />
                                                        <Image src="/images/guides/ibkr/ibkr-manual-step-3-date-range-dark.png" alt="Select Date Range" width={0} height={0} sizes="100vw" className="w-full h-auto hidden dark:block" />
                                                    </div>
                                                </div>


                                                <div className="bg-muted/50 p-4 rounded-lg space-y-3">
                                                    <p className="font-medium text-foreground">Step 4: Download & Upload</p>
                                                    <p>Click <strong>Run</strong> to generate the report. Download the XML file and upload it below.</p>

                                                    {/* Recommended File Naming - Blue */}
                                                    <div className="flex gap-2 items-start text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400 p-3 rounded border border-blue-500/20">
                                                        <Lightbulb className="w-4 h-4 shrink-0" />
                                                        <p><strong>Recommended:</strong> Rename the file (e.g., <code className="bg-blue-500/20 px-1 rounded">2023.xml</code>) before uploading to easily identify the year.</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </AccordionContent>
                                    </AccordionItem>
                                </Accordion>
                            </div>

                            <FileUploader
                                onFilesSelected={handleFilesSelected}
                                acceptedFileTypes=".xml"
                                resetOnSelect={true}
                            />

                            {manualFiles.length > 0 && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-sm font-medium">Uploaded Files ({manualFiles.length})</h4>
                                    </div>
                                    <div className="border rounded-md divide-y max-h-[200px] overflow-y-auto">
                                        {manualFiles.map((file, i) => (
                                            <div key={i} className="flex items-center justify-between p-3 bg-muted/20 hover:bg-muted/40 transition-colors">
                                                <div className="flex items-center gap-3 overflow-hidden">
                                                    <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
                                                        <FileText className="h-4 w-4 text-primary" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-medium truncate">{file.fileName}</p>
                                                        <p className="text-xs text-muted-foreground truncate">
                                                            {(file.cashTransactions?.length || 0) + (file.equitySummary?.length || 0) + (file.openPositions?.length || 0)} records
                                                        </p>
                                                    </div>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleRemoveFile(i)}
                                                    className="h-8 w-8 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 shrink-0"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </TabsContent>
                    </Tabs>
                )}

                <DialogFooter className="gap-2 sm:gap-2 mt-6">
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                    {view === 'ibkr' && <Button type="submit" onClick={handleSave}>Save Configuration</Button>}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
