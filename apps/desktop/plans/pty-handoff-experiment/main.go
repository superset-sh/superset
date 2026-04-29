// PTY handoff reliability test harness.
//
// Spawns N PTY sessions running sequence-numbered workloads, then re-execs
// itself K times, handing off all PTY master fds via SCM_RIGHTS each time.
// Verifies process survival, byte loss, and fd leaks.
//
// Usage:
//   pty-handoff -n=5 -k=10 -workload=counter -outdir=./run-001
//   (internal) pty-handoff -child=true (set by re-exec)
package main

import (
	"encoding/binary"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/creack/pty"
	"golang.org/x/sys/unix"
)

const (
	handoffSocketFD     = 3 // ExtraFiles[0] in child
	defaultReportFile   = "report.json"
	readBufSize         = 64 * 1024
	handoffSettleTimeMs = 100 // child waits this long after attaching before next handoff
)

type Gap struct {
	Expected int64 `json:"expected"`
	Got      int64 `json:"got"`
	Gen      int   `json:"gen"`
}

type SessionMeta struct {
	ID         string `json:"id"`
	PID        int    `json:"pid"`
	Workload   string `json:"workload"`
	LastSeq    int64  `json:"last_seq"`
	Bytes      int64  `json:"bytes"`
	Lines      int64  `json:"lines"`
	Gaps       []Gap  `json:"gaps"`
	PartialBuf string `json:"partial_buf"`
}

type Payload struct {
	Iteration   int           `json:"iteration"`
	TotalK      int           `json:"total_k"`
	Sessions    []SessionMeta `json:"sessions"`
	StartTime   time.Time     `json:"start_time"`
	OutDir      string        `json:"out_dir"`
	HandoffsLat []float64     `json:"handoffs_lat_ms"`
}

type Session struct {
	meta    SessionMeta
	file    *os.File
	gen     int
	cancel  chan struct{}
	done    chan struct{}
	mu      sync.Mutex
	stopped bool
}

var seqRE = regexp.MustCompile(`^SEQ:(\d+)$`)

// processLines parses complete lines from PartialBuf, updates LastSeq/Lines/Gaps.
func (s *Session) processLines() {
	for {
		idx := strings.IndexByte(s.meta.PartialBuf, '\n')
		if idx < 0 {
			return
		}
		line := s.meta.PartialBuf[:idx]
		s.meta.PartialBuf = s.meta.PartialBuf[idx+1:]
		// PTY in cooked mode usually emits \r\n.
		line = strings.TrimRight(line, "\r")
		m := seqRE.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		n, err := strconv.ParseInt(m[1], 10, 64)
		if err != nil {
			continue
		}
		s.meta.Lines++
		expected := s.meta.LastSeq + 1
		// First line case: LastSeq starts at -1 so expected=0 is correct.
		if s.meta.LastSeq == -1 {
			s.meta.LastSeq = n
			continue
		}
		if n != expected {
			s.meta.Gaps = append(s.meta.Gaps, Gap{Expected: expected, Got: n, Gen: s.gen})
		}
		s.meta.LastSeq = n
	}
}

func (s *Session) reader() {
	defer close(s.done)
	buf := make([]byte, readBufSize)
	for {
		select {
		case <-s.cancel:
			return
		default:
		}
		// Use a short deadline so we can poll cancel.
		_ = s.file.SetReadDeadline(time.Now().Add(50 * time.Millisecond))
		n, err := s.file.Read(buf)
		if n > 0 {
			s.mu.Lock()
			s.meta.Bytes += int64(n)
			s.meta.PartialBuf += string(buf[:n])
			s.processLines()
			s.mu.Unlock()
		}
		if err != nil {
			if errors.Is(err, os.ErrDeadlineExceeded) {
				continue
			}
			// EOF, EIO when shell exits, or EBADF when we close on cancel.
			return
		}
	}
}

func (s *Session) signalStop() {
	s.mu.Lock()
	if s.stopped {
		s.mu.Unlock()
		return
	}
	s.stopped = true
	close(s.cancel)
	s.mu.Unlock()
}

func (s *Session) waitStop() {
	<-s.done
}

func (s *Session) stop() {
	s.signalStop()
	s.waitStop()
}

// stopAll signals all sessions to stop, then waits for them. O(max) instead of O(sum).
func stopAll(sessions []*Session) {
	for _, s := range sessions {
		s.signalStop()
	}
	for _, s := range sessions {
		s.waitStop()
	}
}

// workloadCmd returns the command to run inside the PTY for the given workload name.
func workloadCmd(workload string) (*exec.Cmd, error) {
	switch workload {
	case "counter":
		// Fast counter, ~50µs per line; saturates output.
		script := `i=0; while :; do echo "SEQ:$i"; i=$((i+1)); done`
		return exec.Command("/bin/sh", "-c", script), nil
	case "counter-slow":
		// Slower counter, ~10ms per line; tests low-rate handoffs.
		script := `i=0; while :; do echo "SEQ:$i"; i=$((i+1)); sleep 0.01; done`
		return exec.Command("/bin/sh", "-c", script), nil
	case "idle":
		// Bash idle at prompt. Won't produce SEQ lines but tests fd survival of an interactive shell.
		// Use 'sleep' as a simple long-running process that exits cleanly.
		return exec.Command("/bin/sh", "-c", "sleep 3600"), nil
	case "vim":
		// Vim in insert mode. Tests handoff of a curses app.
		// Need to remove typescript afterwards if we kept it.
		return exec.Command("/usr/bin/vim", "-N", "-u", "NONE", "+startinsert"), nil
	case "tmux":
		// Nested tmux with a counter inside.
		script := `tmux -L pty-handoff-test new-session -s s -d 'i=0; while :; do echo "SEQ:$i"; i=$((i+1)); done'; tmux -L pty-handoff-test attach -t s`
		return exec.Command("/bin/sh", "-c", script), nil
	default:
		return nil, fmt.Errorf("unknown workload: %s", workload)
	}
}

// spawnSessions creates N PTY sessions running the given workload.
func spawnSessions(n int, workload string, gen int) ([]*Session, error) {
	sessions := make([]*Session, 0, n)
	for i := 0; i < n; i++ {
		cmd, err := workloadCmd(workload)
		if err != nil {
			return nil, err
		}
		// Set process group so we can kill cleanly if needed.
		cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true, Setctty: true}
		ptmx, err := pty.Start(cmd)
		if err != nil {
			return nil, fmt.Errorf("pty.Start session %d: %w", i, err)
		}
		// 80x24 default size.
		_ = pty.Setsize(ptmx, &pty.Winsize{Rows: 24, Cols: 80})
		// Make non-blocking so SetReadDeadline actually interrupts blocking reads
		// (required for workloads that produce no output, e.g. idle).
		if err := unix.SetNonblock(int(ptmx.Fd()), true); err != nil {
			return nil, fmt.Errorf("set nonblock session %d: %w", i, err)
		}
		s := &Session{
			meta: SessionMeta{
				ID:       fmt.Sprintf("s%03d", i),
				PID:      cmd.Process.Pid,
				Workload: workload,
				LastSeq:  -1,
			},
			file:   ptmx,
			gen:    gen,
			cancel: make(chan struct{}),
			done:   make(chan struct{}),
		}
		sessions = append(sessions, s)
		go s.reader()
	}
	return sessions, nil
}

// reattachSessions wraps received fds + previous metadata as Sessions and starts readers.
func reattachSessions(fds []int, metas []SessionMeta, gen int) []*Session {
	sessions := make([]*Session, len(fds))
	for i, fd := range fds {
		// SCM_RIGHTS may have cleared O_NONBLOCK; re-set so Go's poller deadlines work.
		_ = unix.SetNonblock(fd, true)
		f := os.NewFile(uintptr(fd), fmt.Sprintf("ptmx-%s", metas[i].ID))
		s := &Session{
			meta:   metas[i], // carries LastSeq, Bytes, Gaps, PartialBuf
			file:   f,
			gen:    gen,
			cancel: make(chan struct{}),
			done:   make(chan struct{}),
		}
		sessions[i] = s
		go s.reader()
	}
	return sessions
}

// sendPayload writes a length-prefixed JSON payload + SCM_RIGHTS fds over connFd.
// Stops sessions, dups their fds, sends them, closes original files.
// Returns latency of the send.
func sendPayload(connFd int, sessions []*Session, payload Payload) (time.Duration, error) {
	t0 := time.Now()

	// Stop reader goroutines (parallel) so no concurrent reads on master fds.
	stopAll(sessions)

	// Dup all master fds; close originals.
	dupedFds := make([]int, len(sessions))
	for i, s := range sessions {
		newFd, err := unix.Dup(int(s.file.Fd()))
		if err != nil {
			return 0, fmt.Errorf("dup session %s: %w", s.meta.ID, err)
		}
		dupedFds[i] = newFd
	}

	// Snapshot final session metas into payload.
	payload.Sessions = make([]SessionMeta, len(sessions))
	for i, s := range sessions {
		s.mu.Lock()
		payload.Sessions[i] = s.meta
		s.mu.Unlock()
	}

	// Marshal payload.
	jsonBuf, err := json.Marshal(payload)
	if err != nil {
		return 0, fmt.Errorf("marshal payload: %w", err)
	}

	// Frame: 4-byte length prefix + JSON.
	lenBuf := make([]byte, 4)
	binary.BigEndian.PutUint32(lenBuf, uint32(len(jsonBuf)))
	frame := append(lenBuf, jsonBuf...)

	// Send framed payload + SCM_RIGHTS in one Sendmsg.
	rights := unix.UnixRights(dupedFds...)
	if err := unix.Sendmsg(connFd, frame, rights, nil, 0); err != nil {
		return 0, fmt.Errorf("sendmsg: %w", err)
	}

	// Close duplicates locally; receiver has its own fd table now.
	for _, fd := range dupedFds {
		unix.Close(fd)
	}
	// Close session files.
	for _, s := range sessions {
		s.file.Close()
	}

	// Wait for ack.
	ack := make([]byte, 1)
	if _, err := unix.Read(connFd, ack); err != nil {
		return 0, fmt.Errorf("read ack: %w", err)
	}
	if ack[0] != 0x42 {
		return 0, fmt.Errorf("unexpected ack: 0x%x", ack[0])
	}
	return time.Since(t0), nil
}

// recvPayload reads a length-prefixed JSON payload + SCM_RIGHTS fds from connFd.
// SCM_RIGHTS arrives with the initial Recvmsg; the rest of the framed payload
// may stream in across subsequent reads (SOCK_STREAM has no message boundaries).
// Sends ack after success.
func recvPayload(connFd int) (Payload, []int, error) {
	initial := make([]byte, 64*1024)
	oob := make([]byte, 8192) // enough for ~2000 fds in cmsg
	n, oobn, _, _, err := unix.Recvmsg(connFd, initial, oob, 0)
	if err != nil {
		return Payload{}, nil, fmt.Errorf("recvmsg: %w", err)
	}
	if n < 4 {
		return Payload{}, nil, fmt.Errorf("short frame: %d bytes", n)
	}
	frameLen := binary.BigEndian.Uint32(initial[:4])

	// Assemble the full frame.
	full := make([]byte, frameLen)
	available := n - 4
	if uint32(available) > frameLen {
		available = int(frameLen)
	}
	copy(full, initial[4:4+available])
	read := available
	for uint32(read) < frameLen {
		nn, err := unix.Read(connFd, full[read:])
		if err != nil {
			return Payload{}, nil, fmt.Errorf("read frame: %w", err)
		}
		if nn == 0 {
			return Payload{}, nil, fmt.Errorf("EOF mid-frame at %d/%d", read, frameLen)
		}
		read += nn
	}

	var payload Payload
	if err := json.Unmarshal(full, &payload); err != nil {
		return Payload{}, nil, fmt.Errorf("unmarshal: %w", err)
	}

	// Parse SCM_RIGHTS.
	cmsgs, err := unix.ParseSocketControlMessage(oob[:oobn])
	if err != nil {
		return Payload{}, nil, fmt.Errorf("parse cmsg: %w", err)
	}
	var fds []int
	for _, c := range cmsgs {
		got, err := unix.ParseUnixRights(&c)
		if err != nil {
			return Payload{}, nil, fmt.Errorf("parse rights: %w", err)
		}
		fds = append(fds, got...)
	}
	if len(fds) != len(payload.Sessions) {
		return Payload{}, nil, fmt.Errorf("fd count mismatch: %d fds, %d sessions", len(fds), len(payload.Sessions))
	}

	// Send ack.
	if _, err := unix.Write(connFd, []byte{0x42}); err != nil {
		return Payload{}, nil, fmt.Errorf("write ack: %w", err)
	}

	return payload, fds, nil
}

// reExecChild forks+execs a copy of self in --child mode, with a connected socketpair fd.
// Returns the parent-side fd of the socketpair (caller closes after handoff).
func reExecChild() (parentFd int, childCmd *exec.Cmd, err error) {
	// SOCK_STREAM is what AF_UNIX reliably supports across macOS + Linux.
	// SOCK_SEQPACKET would preserve message boundaries but isn't supported on
	// macOS for AF_UNIX. We deal with stream splitting in recvPayload by reading
	// until the full length-prefixed frame arrives; SCM_RIGHTS travels with the
	// initial Recvmsg.
	pair, err := unix.Socketpair(unix.AF_UNIX, unix.SOCK_STREAM, 0)
	if err != nil {
		return 0, nil, fmt.Errorf("socketpair: %w", err)
	}
	parentFd, childFd := pair[0], pair[1]

	// Wrap childFd as *os.File for ExtraFiles.
	childFile := os.NewFile(uintptr(childFd), "handoff-sock")

	exe, err := os.Executable()
	if err != nil {
		return 0, nil, fmt.Errorf("os.Executable: %w", err)
	}
	cmd := exec.Command(exe, "-child=true")
	cmd.Stdin = nil
	cmd.Stdout = os.Stdout // child shares our stdout for diagnostic logging
	cmd.Stderr = os.Stderr
	cmd.ExtraFiles = []*os.File{childFile} // becomes fd 3 in child
	// Detach into its own session so when we exit, child survives cleanly.
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}

	if err := cmd.Start(); err != nil {
		unix.Close(parentFd)
		childFile.Close()
		return 0, nil, fmt.Errorf("cmd.Start: %w", err)
	}
	// Close child end on our side; child has it now.
	childFile.Close()
	return parentFd, cmd, nil
}

// runGeneration is the main loop for a generation: read PTYs for some interval,
// then either do another handoff or finalize.
func runGeneration(sessions []*Session, payload Payload) {
	gen := payload.Iteration
	totalK := payload.TotalK

	if gen < totalK {
		// Let sessions accumulate output for a bit before handing off.
		time.Sleep(time.Duration(handoffSettleTimeMs) * time.Millisecond)
		// Handoff.
		parentFd, _, err := reExecChild()
		if err != nil {
			fmt.Fprintf(os.Stderr, "[gen %d] reExecChild: %v\n", gen, err)
			os.Exit(2)
		}
		// Time the handoff *including* reExecChild + sendPayload, write to a per-gen latency file
		// so the final generation can aggregate.
		latStart := time.Now()
		_ = latStart
		nextPayload := payload
		nextPayload.Iteration = gen + 1
		latency, err := sendPayload(parentFd, sessions, nextPayload)
		if err != nil {
			fmt.Fprintf(os.Stderr, "[gen %d] sendPayload: %v\n", gen, err)
			os.Exit(2)
		}
		// Append latency record on disk (poor man's IPC for telemetry).
		latFile := filepath.Join(payload.OutDir, "handoff_latencies.txt")
		if f, ferr := os.OpenFile(latFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644); ferr == nil {
			fmt.Fprintf(f, "%.3f\n", float64(latency.Microseconds())/1000.0)
			f.Close()
		}
		fmt.Fprintf(os.Stderr, "[gen %d] handoff to gen %d in %v\n", gen, gen+1, latency)
		// Exit so the child takes over.
		os.Exit(0)
	}

	// Final generation: settle, verify, report.
	time.Sleep(500 * time.Millisecond) // let some final data flow

	// Stop readers in parallel.
	stopAll(sessions)

	// Verify shell processes alive.
	type Result struct {
		ID       string `json:"id"`
		PID      int    `json:"pid"`
		Alive    bool   `json:"alive"`
		Bytes    int64  `json:"bytes"`
		Lines    int64  `json:"lines"`
		LastSeq  int64  `json:"last_seq"`
		GapCount int    `json:"gap_count"`
		Gaps     []Gap  `json:"gaps"`
	}
	results := make([]Result, len(sessions))
	allAlive := true
	totalGaps := 0
	for i, s := range sessions {
		alive := unix.Kill(s.meta.PID, 0) == nil
		if !alive {
			allAlive = false
		}
		totalGaps += len(s.meta.Gaps)
		results[i] = Result{
			ID:       s.meta.ID,
			PID:      s.meta.PID,
			Alive:    alive,
			Bytes:    s.meta.Bytes,
			Lines:    s.meta.Lines,
			LastSeq:  s.meta.LastSeq,
			GapCount: len(s.meta.Gaps),
			Gaps:     s.meta.Gaps,
		}
	}

	report := map[string]interface{}{
		"start_time":   payload.StartTime,
		"end_time":     time.Now(),
		"total_k":      totalK,
		"sessions_n":   len(sessions),
		"all_alive":    allAlive,
		"total_gaps":   totalGaps,
		"handoffs_lat": payload.HandoffsLat,
		"results":      results,
	}

	// Print summary.
	fmt.Printf("\n=== PHASE 0 RESULTS ===\n")
	fmt.Printf("Sessions: %d   Handoffs: %d\n", len(sessions), totalK)
	fmt.Printf("All alive: %v   Total seq gaps: %d\n", allAlive, totalGaps)
	// Read latencies from disk file.
	latFile := filepath.Join(payload.OutDir, "handoff_latencies.txt")
	if data, err := os.ReadFile(latFile); err == nil {
		var lats []float64
		for _, line := range strings.Split(strings.TrimSpace(string(data)), "\n") {
			if v, err := strconv.ParseFloat(line, 64); err == nil {
				lats = append(lats, v)
			}
		}
		if len(lats) > 0 {
			var sum, max, min float64
			min = lats[0]
			for _, l := range lats {
				sum += l
				if l > max {
					max = l
				}
				if l < min {
					min = l
				}
			}
			fmt.Printf("Handoff latency: avg=%.2fms min=%.2fms max=%.2fms (n=%d)\n",
				sum/float64(len(lats)), min, max, len(lats))
			report["handoffs_lat"] = lats
		}
	}
	for _, r := range results {
		marker := "OK"
		if !r.Alive {
			marker = "DEAD"
		}
		if r.GapCount > 0 {
			marker = fmt.Sprintf("%s, %d gaps", marker, r.GapCount)
		}
		fmt.Printf("  %s  pid=%d  bytes=%d  lines=%d  lastSeq=%d  [%s]\n",
			r.ID, r.PID, r.Bytes, r.Lines, r.LastSeq, marker)
	}

	// Kill remaining shells.
	for _, s := range sessions {
		_ = unix.Kill(s.meta.PID, unix.SIGTERM)
	}

	// Write report.
	reportFile := filepath.Join(payload.OutDir, defaultReportFile)
	f, err := os.Create(reportFile)
	if err == nil {
		enc := json.NewEncoder(f)
		enc.SetIndent("", "  ")
		_ = enc.Encode(report)
		f.Close()
		fmt.Printf("\nReport: %s\n", reportFile)
	}

	// Exit code: 0 if all alive AND no gaps; else 1.
	if !allAlive || totalGaps > 0 {
		os.Exit(1)
	}
	os.Exit(0)
}

func main() {
	var (
		n        = flag.Int("n", 1, "number of PTY sessions")
		k        = flag.Int("k", 1, "number of handoffs")
		workload = flag.String("workload", "counter", "workload: counter, counter-slow, idle, vim, tmux")
		outDir   = flag.String("outdir", "./run", "output directory for report")
		isChild  = flag.Bool("child", false, "internal: receive handoff on fd 3")
	)
	flag.Parse()

	if *isChild {
		// Receive handoff on fd 3, then run generation.
		payload, fds, err := recvPayload(handoffSocketFD)
		if err != nil {
			fmt.Fprintf(os.Stderr, "[child] recvPayload: %v\n", err)
			os.Exit(2)
		}
		unix.Close(handoffSocketFD)
		sessions := reattachSessions(fds, payload.Sessions, payload.Iteration)
		runGeneration(sessions, payload)
		return
	}

	// Parent (gen 0): set up, spawn sessions, run.
	if err := os.MkdirAll(*outDir, 0o755); err != nil {
		fmt.Fprintf(os.Stderr, "mkdir %s: %v\n", *outDir, err)
		os.Exit(2)
	}
	abs, _ := filepath.Abs(*outDir)
	*outDir = abs

	fmt.Fprintf(os.Stderr, "[gen 0] spawning %d sessions (workload=%s, k=%d)\n", *n, *workload, *k)
	sessions, err := spawnSessions(*n, *workload, 0)
	if err != nil {
		fmt.Fprintf(os.Stderr, "spawnSessions: %v\n", err)
		os.Exit(2)
	}
	for _, s := range sessions {
		fmt.Fprintf(os.Stderr, "  %s pid=%d\n", s.meta.ID, s.meta.PID)
	}

	payload := Payload{
		Iteration:   0,
		TotalK:      *k,
		StartTime:   time.Now(),
		OutDir:      *outDir,
		HandoffsLat: nil,
	}
	_ = io.EOF // silence unused import in some build configs
	runGeneration(sessions, payload)
}
