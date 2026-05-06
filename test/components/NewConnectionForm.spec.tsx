/**
 * Component tests for NewConnectionForm.
 * dbClient is mocked so no IPC or Electron required.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// ── Mock dbClient ────────────────────────────────────────────────────────────
vi.mock('../../src/services/dbClient', () => ({
  testConnection: vi.fn(),
  openDialog: vi.fn(),
  saveConnection: vi.fn(),
  connectSaved: vi.fn(),
}));

import * as dbClient from '../../src/services/dbClient';
import NewConnectionForm from '../../src/components/Connections/NewConnectionForm';

// ── Helpers ──────────────────────────────────────────────────────────────────

const onConnected = vi.fn();
const onCancel = vi.fn();

function setup() {
  const user = userEvent.setup();
  const utils = render(
    <NewConnectionForm onConnected={onConnected} onCancel={onCancel} />,
  );
  return { user, ...utils };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('NewConnectionForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders SQLite engine as default', () => {
    setup();
    const activeTab = screen.getByRole('button', { name: /sqlite/i });
    expect(activeTab.className).toContain('active');
  });

  it('shows file path field for SQLite', () => {
    setup();
    expect(screen.getByPlaceholderText(/path.*database/i)).toBeTruthy();
  });

  it('shows host/port/database fields when switching to PostgreSQL', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /postgresql/i }));
    // host input has value 'localhost', port has value '5432'
    expect(screen.getByDisplayValue('localhost')).toBeTruthy();
    expect(screen.getByDisplayValue('5432')).toBeTruthy();
  });

  it('default port changes to 3306 when switching to MySQL', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /mysql/i }));
    // Port field should default to 3306
    const portInput = screen.getByDisplayValue('3306');
    expect(portInput).toBeTruthy();
  });

  it('calls onCancel when Cancel is clicked', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('shows validation error when trying to save with empty SQLite path', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /save.*connect/i }));
    expect(await screen.findByText(/path.*required|required.*path/i)).toBeTruthy();
  });

  it('calls testConnection when Test is clicked', async () => {
    vi.mocked(dbClient.testConnection).mockResolvedValue({ ok: true });
    const { user } = setup();
    await user.type(screen.getByPlaceholderText(/path.*database/i), '/tmp/test.db');
    await user.click(screen.getByRole('button', { name: /^test$/i }));
    await waitFor(() => expect(dbClient.testConnection).toHaveBeenCalledOnce());
  });

  it('shows success message after successful test', async () => {
    vi.mocked(dbClient.testConnection).mockResolvedValue({ ok: true });
    const { user } = setup();
    await user.type(screen.getByPlaceholderText(/path.*database/i), '/tmp/test.db');
    await user.click(screen.getByRole('button', { name: /^test$/i }));
    expect(await screen.findByText(/connection successful/i)).toBeTruthy();
  });

  it('shows error message after failed test', async () => {
    vi.mocked(dbClient.testConnection).mockResolvedValue({ ok: false, error: 'File not found' });
    const { user } = setup();
    await user.type(screen.getByPlaceholderText(/path.*database/i), '/tmp/missing.db');
    await user.click(screen.getByRole('button', { name: /^test$/i }));
    expect(await screen.findByText(/file not found/i)).toBeTruthy();
  });

  it('saves and connects on valid SQLite submit', async () => {
    vi.mocked(dbClient.saveConnection).mockResolvedValue({ id: 'saved-1', name: 'test.db', config: { kind: 'sqlite', path: '/tmp/test.db' }, createdAt: new Date().toISOString() });
    vi.mocked(dbClient.connectSaved).mockResolvedValue({ sessionId: 'sess-1', name: 'test.db' });

    const { user } = setup();
    await user.type(screen.getByPlaceholderText(/path.*database/i), '/tmp/test.db');
    await user.click(screen.getByRole('button', { name: /save.*connect/i }));

    await waitFor(() => expect(onConnected).toHaveBeenCalledWith('sess-1', 'test.db'));
  });

  it('shows error when connection fails', async () => {
    vi.mocked(dbClient.saveConnection).mockResolvedValue({ id: 'saved-1', name: 'x', config: { kind: 'sqlite', path: '/x.db' }, createdAt: new Date().toISOString() });
    vi.mocked(dbClient.connectSaved).mockRejectedValue(new Error('Cannot open database'));

    const { user } = setup();
    await user.type(screen.getByPlaceholderText(/path.*database/i), '/x.db');
    await user.click(screen.getByRole('button', { name: /save.*connect/i }));

    expect(await screen.findByText(/cannot open database/i)).toBeTruthy();
  });
});
