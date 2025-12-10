"use client";

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BookOpen, TrendingUp, Activity, Server, ChevronRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export function GuideModal() {
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState(0);

    const totalSteps = 3;

    const handleNext = () => {
        if (step < totalSteps - 1) {
            setStep(step + 1);
        } else {
            setOpen(false);
            setStep(0); // Reset for next time
        }
    };

    const handleOpenChange = (newOpen: boolean) => {
        setOpen(newOpen);
        if (!newOpen) {
            setTimeout(() => setStep(0), 300); // Reset after close animation
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                    <BookOpen className="h-5 w-5" />
                    <span className="sr-only">How it works</span>
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>How BeatTheMarket Works</DialogTitle>
                    <DialogDescription>
                        Understanding your performance in 3 simple steps.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4">
                    {/* Progress Indicators */}
                    <div className="flex justify-center gap-2 mb-8">
                        {Array.from({ length: totalSteps }).map((_, i) => (
                            <div
                                key={i}
                                className={cn(
                                    "h-2 w-2 rounded-full transition-all duration-300",
                                    i === step ? "bg-primary w-6" : "bg-muted"
                                )}
                            />
                        ))}
                    </div>

                    <div className="relative min-h-[220px]">
                        {/* Slide 1: The Why */}
                        {step === 0 && (
                            <div className="flex flex-col items-center text-center space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="p-4 bg-primary/10 rounded-full">
                                    <TrendingUp className="h-8 w-8 text-primary" />
                                </div>
                                <h3 className="text-lg font-semibold">Did you actually beat the market?</h3>
                                <p className="text-muted-foreground text-sm leading-relaxed">
                                    Most brokers only show you your absolute P/L. But if you had just bought the S&P 500 every time you deposited cash, would you be richer? We answer that specific question.
                                </p>
                            </div>
                        )}

                        {/* Slide 2: The How */}
                        {step === 1 && (
                            <div className="flex flex-col items-center text-center space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="p-4 bg-blue-500/10 rounded-full">
                                    <Activity className="h-8 w-8 text-blue-500" />
                                </div>
                                <h3 className="text-lg font-semibold">Simulated Benchmarking</h3>
                                <p className="text-muted-foreground text-sm leading-relaxed">
                                    We look at every single deposit you made. We simulate buying the benchmark (e.g., SPY) on that <strong>exact day</strong>. Then we compare your actual ending balance vs. this hypothetical benchmark balance.
                                </p>
                            </div>
                        )}

                        {/* Slide 3: The Action */}
                        {step === 2 && (
                            <div className="flex flex-col items-center text-center space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="p-4 bg-green-500/10 rounded-full">
                                    <ShieldCheck className="h-8 w-8 text-green-500" />
                                </div>
                                <h3 className="text-lg font-semibold">Your Data Stays Private</h3>
                                <div className="text-muted-foreground text-sm space-y-3 text-center w-full px-4">
                                    <p>
                                        We do <strong className="text-foreground">not</strong> store your data.
                                    </p>
                                    <p>
                                        Your portfolio history is processed safely in memory. It is never saved to a database.
                                    </p>
                                    <p className="pt-2">
                                        Ready to see your true performance? <br />
                                        Click <strong>Sync Data</strong> to connect safely.
                                    </p>
                                </div>
                            </div>
                        )}      </div>
                </div>

                <DialogFooter className="flex justify-between items-center flex-row gap-2">
                    <Button
                        variant="ghost"
                        onClick={() => setOpen(false)}
                        className="text-muted-foreground text-xs hover:text-foreground"
                    >
                        Skip Guide
                    </Button>

                    <Button onClick={handleNext} className="min-w-[80px] sm:min-w-[100px]">
                        {step === totalSteps - 1 ? (
                            <>
                                Got it <CheckCircle2 className="ml-2 h-4 w-4" />
                            </>
                        ) : (
                            <>
                                Next <ChevronRight className="ml-2 h-4 w-4" />
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
