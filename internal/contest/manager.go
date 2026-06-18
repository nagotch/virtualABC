package contest

import (
	"fmt"
	"sync"
	"time"

	"github.com/nagotch/virtualABC/internal/atcoder"
)

type Manager struct {
	mu       sync.RWMutex
	contests map[string]*Contest
	atcoder  *atcoder.Client
}

func NewManager(ac *atcoder.Client) *Manager {
	return &Manager{
		contests: make(map[string]*Contest),
		atcoder:  ac,
	}
}

func (m *Manager) GetContest(channelID string) (*Contest, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	c, ok := m.contests[channelID]
	return c, ok
}

func (m *Manager) StartContest(channelID, creatorID, contestID string, duration time.Duration) (*Contest, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if c, exists := m.contests[channelID]; exists && c.Status == StatusActive {
		return nil, fmt.Errorf("このチャンネルでは既にコンテストが進行中です")
	}

	rawProblems, err := m.atcoder.GetABCProblems(contestID)
	if err != nil {
		return nil, fmt.Errorf("問題の取得に失敗しました: %w", err)
	}

	problems := make([]Problem, 0, len(rawProblems))
	for _, p := range rawProblems {
		problems = append(problems, Problem{
			ID:    p.ID,
			Index: p.ProblemIndex,
			Title: p.Title,
			Score: indexToScore(p.ProblemIndex),
		})
	}

	c := &Contest{
		ID:           fmt.Sprintf("%s-%d", channelID, time.Now().Unix()),
		ChannelID:    channelID,
		ContestID:    contestID,
		StartTime:    time.Now(),
		Duration:     duration,
		Problems:     problems,
		Participants: make(map[string]*Participant),
		Status:       StatusActive,
		CreatorID:    creatorID,
	}

	m.contests[channelID] = c
	return c, nil
}

func (m *Manager) JoinContest(channelID, traqID, atcoderID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	c, ok := m.contests[channelID]
	if !ok || c.Status != StatusActive {
		return fmt.Errorf("このチャンネルで進行中のコンテストはありません")
	}

	if _, exists := c.Participants[traqID]; exists {
		return fmt.Errorf("すでに参加しています")
	}

	c.Participants[traqID] = &Participant{
		TraQID:    traqID,
		AtCoderID: atcoderID,
		Results:   make(map[string]*ProblemResult),
	}
	return nil
}

func (m *Manager) EndContest(channelID string) (*Contest, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	c, ok := m.contests[channelID]
	if !ok || c.Status != StatusActive {
		return nil, fmt.Errorf("このチャンネルで進行中のコンテストはありません")
	}

	c.Status = StatusEnded
	return c, nil
}

// UpdateAllSubmissions polls AtCoder API for all active contest participants.
func (m *Manager) UpdateAllSubmissions() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, c := range m.contests {
		if c.Status != StatusActive {
			continue
		}
		for _, p := range c.Participants {
			subs, err := m.atcoder.GetUserSubmissions(p.AtCoderID, c.StartTime.Unix())
			if err != nil {
				continue
			}
			c.UpdateSubmissions(p.AtCoderID, p.TraQID, subs)
		}
	}
}
