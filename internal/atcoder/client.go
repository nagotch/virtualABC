package atcoder

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"time"
)

const baseURL = "https://kenkoooo.com/atcoder"

type Client struct {
	http *http.Client
}

func NewClient() *Client {
	return &Client{
		http: &http.Client{Timeout: 15 * time.Second},
	}
}

type Problem struct {
	ID           string   `json:"id"`
	ContestID    string   `json:"contest_id"`
	ProblemIndex string   `json:"problem_index"`
	Title        string   `json:"title"`
	Score        *float64 `json:"point"`
}

type Submission struct {
	ID            int64  `json:"id"`
	EpochSecond   int64  `json:"epoch_second"`
	ProblemID     string `json:"problem_id"`
	ContestID     string `json:"contest_id"`
	UserID        string `json:"user_id"`
	Language      string `json:"language"`
	Point         float64 `json:"point"`
	Length        int    `json:"length"`
	Result        string `json:"result"`
	ExecutionTime *int   `json:"execution_time"`
}

func (c *Client) GetProblems() ([]Problem, error) {
	resp, err := c.http.Get(baseURL + "/resources/problems.json")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var problems []Problem
	if err := json.NewDecoder(resp.Body).Decode(&problems); err != nil {
		return nil, err
	}
	return problems, nil
}

func (c *Client) GetABCProblems(contestID string) ([]Problem, error) {
	problems, err := c.GetProblems()
	if err != nil {
		return nil, err
	}

	var result []Problem
	for _, p := range problems {
		if p.ContestID == contestID {
			result = append(result, p)
		}
	}

	if len(result) == 0 {
		return nil, fmt.Errorf("コンテスト %s の問題が見つかりません", contestID)
	}

	sort.Slice(result, func(i, j int) bool {
		return result[i].ProblemIndex < result[j].ProblemIndex
	})

	return result, nil
}

// GetUserSubmissions returns at most 500 submissions after fromSecond.
func (c *Client) GetUserSubmissions(userID string, fromSecond int64) ([]Submission, error) {
	url := fmt.Sprintf("%s/atcoder-api/v3/user/submissions?user=%s&from_second=%d", baseURL, userID, fromSecond)
	resp, err := c.http.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var submissions []Submission
	if err := json.NewDecoder(resp.Body).Decode(&submissions); err != nil {
		return nil, err
	}
	return submissions, nil
}
