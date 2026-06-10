package main

import (
	"bufio"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

type commandResult struct {
	Result any    `json:"result"`
	Error  string `json:"error,omitempty"`
}

type redisError string

func (e redisError) Error() string {
	return string(e)
}

func main() {
	port := envOrDefault("PORT", "80")
	token := envOrDefault("KV_REST_API_TOKEN", "local-kv-token")
	redisAddr := envOrDefault("REDIS_ADDR", "redis:6379")

	handler := &server{
		token:     token,
		redisAddr: redisAddr,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/", handler.handle)

	log.Printf("[local-kv-rest] listening on :%s redis=%s", port, redisAddr)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatal(err)
	}
}

type server struct {
	token     string
	redisAddr string
}

func (s *server) handle(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet && r.URL.Path == "/health" {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
		return
	}

	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "method not allowed"})
		return
	}

	if s.token != "" && r.Header.Get("Authorization") != "Bearer "+s.token {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "unauthorized"})
		return
	}

	var body any
	decoder := json.NewDecoder(r.Body)
	decoder.UseNumber()
	if err := decoder.Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid json body"})
		return
	}

	base64Responses := strings.EqualFold(r.Header.Get("Upstash-Encoding"), "base64")
	result := s.executeBody(body, base64Responses)
	writeJSON(w, http.StatusOK, result)
}

func (s *server) executeBody(body any, base64Responses bool) any {
	items, ok := body.([]any)
	if !ok {
		return commandResult{Error: "body must be a command array"}
	}
	if len(items) == 0 {
		return commandResult{Error: "command must not be empty"}
	}

	if _, pipeline := items[0].([]any); pipeline {
		results := make([]commandResult, 0, len(items))
		for _, item := range items {
			command, err := normalizeCommand(item)
			if err != nil {
				results = append(results, commandResult{Error: err.Error()})
				continue
			}
			results = append(results, s.executeCommand(command, base64Responses))
		}
		return results
	}

	command, err := normalizeCommand(items)
	if err != nil {
		return commandResult{Error: err.Error()}
	}
	return s.executeCommand(command, base64Responses)
}

func (s *server) executeCommand(command []string, base64Responses bool) commandResult {
	result, err := sendRedisCommand(s.redisAddr, command)
	if err != nil {
		return commandResult{Error: err.Error()}
	}
	if base64Responses {
		result = encodeStrings(result)
	}
	return commandResult{Result: result}
}

func normalizeCommand(value any) ([]string, error) {
	items, ok := value.([]any)
	if !ok {
		return nil, errors.New("command must be an array")
	}
	command := make([]string, 0, len(items))
	for _, item := range items {
		command = append(command, stringify(item))
	}
	if len(command) == 0 || command[0] == "" {
		return nil, errors.New("command name is required")
	}
	return command, nil
}

func stringify(value any) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		return typed
	case json.Number:
		return typed.String()
	case bool:
		if typed {
			return "true"
		}
		return "false"
	default:
		encoded, err := json.Marshal(typed)
		if err != nil {
			return fmt.Sprint(typed)
		}
		return string(encoded)
	}
}

func sendRedisCommand(addr string, command []string) (any, error) {
	conn, err := net.DialTimeout("tcp", addr, 5*time.Second)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	if _, err := conn.Write(encodeRESPCommand(command)); err != nil {
		return nil, err
	}

	reader := bufio.NewReader(conn)
	return readRESP(reader)
}

func encodeRESPCommand(command []string) []byte {
	var builder strings.Builder
	builder.WriteString("*")
	builder.WriteString(strconv.Itoa(len(command)))
	builder.WriteString("\r\n")
	for _, arg := range command {
		builder.WriteString("$")
		builder.WriteString(strconv.Itoa(len(arg)))
		builder.WriteString("\r\n")
		builder.WriteString(arg)
		builder.WriteString("\r\n")
	}
	return []byte(builder.String())
}

func readRESP(reader *bufio.Reader) (any, error) {
	prefix, err := reader.ReadByte()
	if err != nil {
		return nil, err
	}

	switch prefix {
	case '+':
		return readLine(reader)
	case '-':
		line, err := readLine(reader)
		if err != nil {
			return nil, err
		}
		return nil, redisError(line)
	case ':':
		line, err := readLine(reader)
		if err != nil {
			return nil, err
		}
		return strconv.ParseInt(line, 10, 64)
	case '$':
		line, err := readLine(reader)
		if err != nil {
			return nil, err
		}
		size, err := strconv.Atoi(line)
		if err != nil {
			return nil, err
		}
		if size == -1 {
			return nil, nil
		}
		buffer := make([]byte, size+2)
		if _, err := io.ReadFull(reader, buffer); err != nil {
			return nil, err
		}
		return string(buffer[:size]), nil
	case '*':
		line, err := readLine(reader)
		if err != nil {
			return nil, err
		}
		count, err := strconv.Atoi(line)
		if err != nil {
			return nil, err
		}
		if count == -1 {
			return nil, nil
		}
		items := make([]any, 0, count)
		for range count {
			item, err := readRESP(reader)
			if err != nil {
				return nil, err
			}
			items = append(items, item)
		}
		return items, nil
	default:
		return nil, fmt.Errorf("unsupported redis response prefix %q", prefix)
	}
}

func readLine(reader *bufio.Reader) (string, error) {
	line, err := reader.ReadString('\n')
	if err != nil {
		return "", err
	}
	return strings.TrimSuffix(strings.TrimSuffix(line, "\n"), "\r"), nil
}

func encodeStrings(value any) any {
	switch typed := value.(type) {
	case string:
		return base64.StdEncoding.EncodeToString([]byte(typed))
	case []any:
		encoded := make([]any, 0, len(typed))
		for _, item := range typed {
			encoded = append(encoded, encodeStrings(item))
		}
		return encoded
	default:
		return typed
	}
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		log.Printf("[local-kv-rest] encode response failed: %v", err)
	}
}

func envOrDefault(name string, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}
