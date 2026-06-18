package store

import (
	"encoding/json"
	"os"
	"sync"
)

type UserRegistration struct {
	TraQID    string `json:"traq_id"`
	AtCoderID string `json:"atcoder_id"`
}

type Store struct {
	mu       sync.RWMutex
	Users    map[string]UserRegistration `json:"users"`
	filePath string
}

func New(filePath string) (*Store, error) {
	s := &Store{
		Users:    make(map[string]UserRegistration),
		filePath: filePath,
	}

	if _, err := os.Stat(filePath); err == nil {
		if err := s.load(); err != nil {
			return nil, err
		}
	}

	return s, nil
}

func (s *Store) RegisterUser(traqID, atcoderID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.Users[traqID] = UserRegistration{
		TraQID:    traqID,
		AtCoderID: atcoderID,
	}
	return s.save()
}

func (s *Store) GetUser(traqID string) (UserRegistration, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	u, ok := s.Users[traqID]
	return u, ok
}

func (s *Store) load() error {
	data, err := os.ReadFile(s.filePath)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, s)
}

func (s *Store) save() error {
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.filePath, data, 0644)
}
