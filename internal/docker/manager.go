package docker

import (
	"context"
	"io"
	"strings"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/client"
)

// Container represents a Docker container
type Container struct {
	ID      string   `json:"id"`
	Name    string   `json:"name"`
	Image   string   `json:"image"`
	State   string   `json:"state"`
	Status  string   `json:"status"`
	Ports   []string `json:"ports"`
	Created int64    `json:"created"`
}

// Manager manages Docker containers
type Manager struct {
	client *client.Client
}

// NewManager creates a new Docker manager
func NewManager() (*Manager, error) {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, err
	}

	return &Manager{client: cli}, nil
}

// IsAvailable checks if Docker is available
func (m *Manager) IsAvailable() bool {
	if m.client == nil {
		return false
	}
	ctx := context.Background()
	_, err := m.client.Ping(ctx)
	return err == nil
}

// ListContainers lists all containers
func (m *Manager) ListContainers(all bool) ([]Container, error) {
	ctx := context.Background()

	containers, err := m.client.ContainerList(ctx, container.ListOptions{
		All: all,
	})
	if err != nil {
		return nil, err
	}

	result := make([]Container, len(containers))
	for i, c := range containers {
		ports := make([]string, len(c.Ports))
		for j, p := range c.Ports {
			if p.PublicPort > 0 {
				ports[j] = formatPort(p)
			} else {
				ports[j] = formatPortPrivate(p)
			}
		}

		name := ""
		if len(c.Names) > 0 {
			name = strings.TrimPrefix(c.Names[0], "/")
		}

		result[i] = Container{
			ID:      c.ID[:12],
			Name:    name,
			Image:   c.Image,
			State:   c.State,
			Status:  c.Status,
			Ports:   ports,
			Created: c.Created,
		}
	}

	return result, nil
}

// ListContainersForProject lists containers related to a project (by directory name or label)
func (m *Manager) ListContainersForProject(projectName string) ([]Container, error) {
	ctx := context.Background()

	// Try to find containers with project label or name prefix
	args := filters.NewArgs()
	args.Add("name", projectName)

	containers, err := m.client.ContainerList(ctx, container.ListOptions{
		All:     true,
		Filters: args,
	})
	if err != nil {
		// Fallback to listing all
		return m.ListContainers(true)
	}

	result := make([]Container, len(containers))
	for i, c := range containers {
		ports := make([]string, len(c.Ports))
		for j, p := range c.Ports {
			ports[j] = formatPort(p)
		}

		name := ""
		if len(c.Names) > 0 {
			name = strings.TrimPrefix(c.Names[0], "/")
		}

		result[i] = Container{
			ID:      c.ID[:12],
			Name:    name,
			Image:   c.Image,
			State:   c.State,
			Status:  c.Status,
			Ports:   ports,
			Created: c.Created,
		}
	}

	return result, nil
}

// StartContainer starts a container
func (m *Manager) StartContainer(id string) error {
	ctx := context.Background()
	return m.client.ContainerStart(ctx, id, container.StartOptions{})
}

// StopContainer stops a container
func (m *Manager) StopContainer(id string) error {
	ctx := context.Background()
	timeout := 10
	return m.client.ContainerStop(ctx, id, container.StopOptions{Timeout: &timeout})
}

// RestartContainer restarts a container
func (m *Manager) RestartContainer(id string) error {
	ctx := context.Background()
	timeout := 10
	return m.client.ContainerRestart(ctx, id, container.StopOptions{Timeout: &timeout})
}

// RemoveContainer removes a container
func (m *Manager) RemoveContainer(id string, force bool) error {
	ctx := context.Background()
	return m.client.ContainerRemove(ctx, id, container.RemoveOptions{Force: force})
}

// GetContainerLogs gets container logs
func (m *Manager) GetContainerLogs(id string, tail int) (string, error) {
	ctx := context.Background()

	options := container.LogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Tail:       "100",
		Timestamps: true,
	}

	if tail > 0 {
		options.Tail = string(rune(tail))
	}

	reader, err := m.client.ContainerLogs(ctx, id, options)
	if err != nil {
		return "", err
	}
	defer reader.Close()

	// Read logs
	buf := make([]byte, 32*1024)
	var logs strings.Builder
	for {
		n, err := reader.Read(buf)
		if n > 0 {
			// Skip the 8-byte header that Docker adds
			data := buf[:n]
			if len(data) > 8 {
				logs.Write(data[8:])
			} else {
				logs.Write(data)
			}
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			break
		}
	}

	return logs.String(), nil
}

// Close closes the Docker client
func (m *Manager) Close() error {
	if m.client != nil {
		return m.client.Close()
	}
	return nil
}

func formatPort(p types.Port) string {
	if p.PublicPort > 0 {
		return strings.ToLower(string(p.Type)) + ":" + string(rune(p.PublicPort)) + "->" + string(rune(p.PrivatePort))
	}
	return formatPortPrivate(p)
}

func formatPortPrivate(p types.Port) string {
	return strings.ToLower(string(p.Type)) + ":" + string(rune(p.PrivatePort))
}
