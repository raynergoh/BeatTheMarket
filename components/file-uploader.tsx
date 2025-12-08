"use client"

import { useCallback, useState, useRef } from "react"
import { Upload, X, FileText, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

interface FileUploaderProps {
    onFilesSelected: (files: File[]) => void
    acceptedFileTypes?: string // e.g., ".xml"
}

export function FileUploader({ onFilesSelected, acceptedFileTypes = ".xml" }: FileUploaderProps) {
    const [dragActive, setDragActive] = useState(false)
    const [selectedFiles, setSelectedFiles] = useState<File[]>([])
    const inputRef = useRef<HTMLInputElement>(null)

    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true)
        } else if (e.type === "dragleave") {
            setDragActive(false)
        }
    }, [])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setDragActive(false)
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const newFiles = Array.from(e.dataTransfer.files)
            const validFiles = newFiles.filter(f => f.name.toLowerCase().endsWith('.xml'))
            setSelectedFiles(prev => [...prev, ...validFiles])
            onFilesSelected(validFiles)
        }
    }, [onFilesSelected])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        e.preventDefault()
        if (e.target.files && e.target.files.length > 0) {
            const newFiles = Array.from(e.target.files)
            setSelectedFiles(prev => [...prev, ...newFiles])
            onFilesSelected(newFiles)
        }
    }

    const removeFile = (index: number) => {
        const newFiles = [...selectedFiles]
        newFiles.splice(index, 1)
        setSelectedFiles(newFiles)
    }

    return (
        <div className="space-y-4">
            <div
                className={`relative flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg transition-colors cursor-pointer
                ${dragActive ? "border-primary bg-primary/10" : "border-muted-foreground/25 hover:border-primary/50"}
                `}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
            >
                <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept={acceptedFileTypes}
                    className="hidden"
                    onChange={handleChange}
                />
                <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center">
                    <Upload className={`w-8 h-8 mb-2 ${dragActive ? "text-primary" : "text-muted-foreground"}`} />
                    <p className="mb-2 text-sm text-foreground">
                        <span className="font-semibold">Click to upload</span> or drag and drop
                    </p>
                    <p className="text-xs text-muted-foreground">XML files only</p>
                </div>
            </div>

            {selectedFiles.length > 0 && (
                <div className="space-y-2">
                    {selectedFiles.map((file, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 text-sm border rounded bg-muted/50">
                            <div className="flex items-center gap-2 overflow-hidden">
                                <FileText className="h-4 w-4 shrink-0" />
                                <span className="truncate">{file.name}</span>
                                <span className="text-xs text-muted-foreground">({(file.size / 1024).toFixed(1)} KB)</span>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 rounded-full"
                                onClick={() => removeFile(idx)}
                            >
                                <X className="h-3 w-3" />
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
