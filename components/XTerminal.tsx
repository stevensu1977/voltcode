import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

interface XTerminalProps {
  terminalId: string;
  onData: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
}

export interface XTerminalHandle {
  write: (data: string) => void;
  fit: () => void;
  focus: () => void;
}

const XTerminal = forwardRef<XTerminalHandle, XTerminalProps>(({ terminalId, onData, onResize }, ref) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const onDataRef = useRef(onData);
  const onResizeRef = useRef(onResize);
  const initializedRef = useRef(false);

  // Keep refs updated
  useEffect(() => {
    onDataRef.current = onData;
  }, [onData]);

  useEffect(() => {
    onResizeRef.current = onResize;
  }, [onResize]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    write: (data: string) => {
      if (xtermRef.current) {
        xtermRef.current.write(data);
      }
    },
    fit: () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    },
    focus: () => {
      if (xtermRef.current) {
        xtermRef.current.focus();
      }
    },
  }), []);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Prevent double initialization in StrictMode
    if (initializedRef.current) return;
    initializedRef.current = true;

    // Create terminal instance
    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#0d0f14',
        foreground: '#e4e4e7',
        cursor: '#e4e4e7',
        cursorAccent: '#0d0f14',
        selectionBackground: '#3b82f680',
        black: '#000000',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#e4e4e7',
        brightBlack: '#71717a',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#facc15',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#ffffff',
      },
      allowProposedApi: true,
    });

    // Create and load addons
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);

    // Open terminal in container
    terminal.open(terminalRef.current);

    // Fit to container
    setTimeout(() => {
      fitAddon.fit();
    }, 0);

    // Store refs
    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Register onData using ref (to avoid re-registration on callback change)
    terminal.onData((data) => {
      onDataRef.current(data);
    });

    // Register onResize using ref
    terminal.onResize(({ cols, rows }) => {
      onResizeRef.current?.(cols, rows);
    });

    // Handle window resize
    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    };

    window.addEventListener('resize', handleResize);

    // Use ResizeObserver for container size changes
    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(terminalRef.current);

    // Focus terminal
    terminal.focus();

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      terminal.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
      initializedRef.current = false;
    };
  }, [terminalId]); // Only recreate when terminalId changes

  return (
    <div
      ref={terminalRef}
      data-terminal-id={terminalId}
      className="w-full h-full"
    />
  );
});

XTerminal.displayName = 'XTerminal';

export default XTerminal;
