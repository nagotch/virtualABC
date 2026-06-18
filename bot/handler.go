package bot

import (
	"context"
	"fmt"
	"strings"
	"time"

	traq "github.com/traPtitech/go-traq"
	traqbot "github.com/traPtitech/traq-bot"

	"github.com/nagotch/virtualABC/internal/contest"
	"github.com/nagotch/virtualABC/internal/store"
)

const defaultDuration = 100 * time.Minute

type Handler struct {
	api     *traq.APIClient
	manager *contest.Manager
	store   *store.Store
	botName string // e.g. "BOT_virtualABC"
}

func New(api *traq.APIClient, m *contest.Manager, s *store.Store, botName string) *Handler {
	return &Handler{api: api, manager: m, store: s, botName: botName}
}

// isMentioned checks p.Message.Embedded for this bot's mention.
func (h *Handler) isMentioned(p *traqbot.MessageCreatedPayload) bool {
	if p.Message.User.Name == h.botName {
		return false
	}
	for _, e := range p.Message.Embedded {
		if e.Type == "user" && e.Raw == "@"+h.botName {
			return true
		}
	}
	return false
}

// extractArgs parses args from raw text after the bot mention.
// traQ mention format in Text: !{"type":"user","raw":"@BOT_NAME","id":"UUID"}
func (h *Handler) extractArgs(text string) []string {
	needle := `"raw":"@` + h.botName + `"`
	idx := strings.Index(text, needle)
	if idx == -1 {
		return nil
	}
	closeIdx := strings.Index(text[idx:], "}")
	if closeIdx == -1 {
		return nil
	}
	rest := strings.TrimSpace(text[idx+closeIdx+1:])
	if rest == "" {
		return nil
	}
	return strings.Fields(rest)
}

func (h *Handler) OnMessageCreated(p *traqbot.MessageCreatedPayload) {
	if !h.isMentioned(p) {
		return
	}

	args := h.extractArgs(p.Message.Text)
	channelID := p.Message.ChannelID
	senderName := p.Message.User.Name

	if len(args) == 0 {
		h.sendHelp(channelID)
		return
	}

	switch args[0] {
	case "register":
		if len(args) < 2 {
			h.send(channelID, fmt.Sprintf(":warning: 使い方: `@%s register <AtCoder ID>`", h.botName))
			return
		}
		h.handleRegister(channelID, senderName, args[1])

	case "start":
		if len(args) < 2 {
			h.send(channelID, fmt.Sprintf(":warning: 使い方: `@%s start <コンテストID> [時間(分)]`\n例: `@%s start abc300 100`", h.botName, h.botName))
			return
		}
		duration := defaultDuration
		if len(args) >= 3 {
			var mins int
			if n, _ := fmt.Sscanf(args[2], "%d", &mins); n == 1 && mins > 0 {
				duration = time.Duration(mins) * time.Minute
			}
		}
		h.handleStart(channelID, senderName, strings.ToLower(args[1]), duration)

	case "join":
		h.handleJoin(channelID, senderName)

	case "standings":
		h.handleStandings(channelID)

	case "status":
		h.handleStatus(channelID)

	case "end":
		h.handleEnd(channelID)

	default:
		h.sendHelp(channelID)
	}
}

func (h *Handler) handleRegister(channelID, traqID, atcoderID string) {
	if err := h.store.RegisterUser(traqID, atcoderID); err != nil {
		h.send(channelID, ":x: 登録に失敗しました: "+err.Error())
		return
	}
	h.send(channelID, fmt.Sprintf(":white_check_mark: @%s のAtCoder IDを `%s` として登録しました！", traqID, atcoderID))
}

func (h *Handler) handleStart(channelID, creatorID, contestID string, duration time.Duration) {
	h.send(channelID, fmt.Sprintf(":hourglass: %s の問題を取得中...", strings.ToUpper(contestID)))

	c, err := h.manager.StartContest(channelID, creatorID, contestID, duration)
	if err != nil {
		h.send(channelID, ":x: "+err.Error())
		return
	}

	msg := fmt.Sprintf("## :trophy: Virtual ABC 開始！\n\n**コンテスト**: %s\n**開始時刻**: %s\n**終了時刻**: %s（%d分間）\n\n### 問題一覧\n",
		strings.ToUpper(contestID),
		c.StartTime.Format("15:04:05"),
		c.EndTime().Format("15:04:05"),
		int(duration.Minutes()),
	)
	for _, p := range c.Problems {
		msg += fmt.Sprintf("- **%s** - %s （%d点）\n", p.Index, p.Title, p.Score)
	}
	msg += fmt.Sprintf("\n`@%s join` で参加できます！", h.botName)
	h.send(channelID, msg)
}

func (h *Handler) handleJoin(channelID, traqID string) {
	user, ok := h.store.GetUser(traqID)
	if !ok {
		h.send(channelID, fmt.Sprintf(":warning: @%s さんはAtCoder IDが未登録です。`@%s register <AtCoder ID>` で登録してください。", traqID, h.botName))
		return
	}
	if err := h.manager.JoinContest(channelID, traqID, user.AtCoderID); err != nil {
		h.send(channelID, ":x: "+err.Error())
		return
	}
	h.send(channelID, fmt.Sprintf(":white_check_mark: @%s (AtCoder: `%s`) が参加しました！", traqID, user.AtCoderID))
}

func (h *Handler) handleStandings(channelID string) {
	c, ok := h.manager.GetContest(channelID)
	if !ok {
		h.send(channelID, ":information_source: このチャンネルで進行中のコンテストはありません。")
		return
	}

	standings := c.GetStandings()
	msg := fmt.Sprintf("## :bar_chart: 順位表 — %s\n\n", strings.ToUpper(c.ContestID))

	if len(standings) == 0 {
		msg += fmt.Sprintf("まだ参加者がいません。`@%s join` で参加しましょう！", h.botName)
		h.send(channelID, msg)
		return
	}

	header := "| 順位 | ユーザー | 得点 | ペナ |"
	sep := "|------|---------|------|------|"
	for _, p := range c.Problems {
		header += fmt.Sprintf(" %s |", p.Index)
		sep += "---|"
	}
	msg += header + "\n" + sep + "\n"

	for _, s := range standings {
		row := fmt.Sprintf("| %d | @%s | %d | %s |",
			s.Rank, s.TraQID, s.Score, formatSecs(s.Penalty))
		for _, p := range c.Problems {
			r, exists := s.Results[p.ID]
			switch {
			case !exists:
				row += " - |"
			case r.ACTime == nil && r.WACount > 0:
				row += fmt.Sprintf(" (%d) |", r.WACount)
			case r.ACTime == nil:
				row += " - |"
			case r.WACount > 0:
				row += fmt.Sprintf(" %s (%d) |", formatSecs(r.TimeSecs), r.WACount)
			default:
				row += fmt.Sprintf(" %s |", formatSecs(r.TimeSecs))
			}
		}
		msg += row + "\n"
	}

	remaining := time.Until(c.EndTime())
	if remaining > 0 {
		msg += fmt.Sprintf("\n:alarm_clock: 残り **%s**", formatDuration(remaining))
	} else {
		msg += fmt.Sprintf("\nコンテストは終了しています。`@%s end` で締め切ってください。", h.botName)
	}
	h.send(channelID, msg)
}

func (h *Handler) handleStatus(channelID string) {
	c, ok := h.manager.GetContest(channelID)
	if !ok {
		h.send(channelID, ":information_source: このチャンネルで進行中のコンテストはありません。")
		return
	}

	remaining := time.Until(c.EndTime())
	statusStr := "進行中"
	if remaining <= 0 {
		statusStr = fmt.Sprintf("時間切れ（`@%s end` で終了）", h.botName)
	}

	msg := fmt.Sprintf("**コンテスト**: %s\n**状態**: %s\n**参加者数**: %d人",
		strings.ToUpper(c.ContestID), statusStr, len(c.Participants))
	if remaining > 0 {
		msg += fmt.Sprintf("\n**残り時間**: %s", formatDuration(remaining))
	}
	h.send(channelID, msg)
}

func (h *Handler) handleEnd(channelID string) {
	c, err := h.manager.EndContest(channelID)
	if err != nil {
		h.send(channelID, ":x: "+err.Error())
		return
	}

	standings := c.GetStandings()
	msg := fmt.Sprintf("## :checkered_flag: %s 終了！\n\n### 最終順位\n\n", strings.ToUpper(c.ContestID))

	if len(standings) == 0 {
		msg += "参加者がいませんでした。"
	} else {
		medals := []string{":first_place_medal:", ":second_place_medal:", ":third_place_medal:"}
		for i, s := range standings {
			medal := ""
			if i < len(medals) {
				medal = medals[i] + " "
			}
			msg += fmt.Sprintf("%s**%d位** @%s — %d点（ペナルティ %s）\n",
				medal, s.Rank, s.TraQID, s.Score, formatSecs(s.Penalty))
		}
	}
	h.send(channelID, msg)
}

func (h *Handler) sendHelp(channelID string) {
	b := h.botName
	h.send(channelID, fmt.Sprintf(`## Virtual ABC Bot

| コマンド | 説明 |
|---------|------|
| `+"`@%s register <AtCoder ID>`"+` | AtCoder IDを登録する |
| `+"`@%s start <コンテストID> [時間(分)]`"+` | コンテストを開始する（例: `+"`@%s start abc300`"+`）|
| `+"`@%s join`"+` | 進行中のコンテストに参加する |
| `+"`@%s standings`"+` | 現在の順位表を表示する |
| `+"`@%s status`"+` | コンテストの状態を確認する |
| `+"`@%s end`"+` | コンテストを終了して最終結果を表示する |`, b, b, b, b, b, b, b))
}

func (h *Handler) send(channelID, content string) {
	_, _, err := h.api.
		ChannelAPI.
		PostMessage(context.Background(), channelID).
		PostMessageRequest(traq.PostMessageRequest{
			Content: content,
		}).
		Execute()
	if err != nil {
		fmt.Println("send error:", err)
	}
}

func formatSecs(seconds int) string {
	m := seconds / 60
	s := seconds % 60
	return fmt.Sprintf("%d:%02d", m, s)
}

func formatDuration(d time.Duration) string {
	h := int(d.Hours())
	m := int(d.Minutes()) % 60
	s := int(d.Seconds()) % 60
	if h > 0 {
		return fmt.Sprintf("%d時間%d分%d秒", h, m, s)
	}
	return fmt.Sprintf("%d分%d秒", m, s)
}
