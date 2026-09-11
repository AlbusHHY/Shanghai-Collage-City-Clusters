(function(){
  'use strict';

  const familiarity = ['Unfamiliar', 'Moderately familiar', 'Very familiar'];
  const agreement = ['No match', 'Moderate match', 'Strong match'];
  const familiarityCodes = ['unfamiliar', 'somewhat_familiar', 'very_familiar'];
  const agreementCodes = ['disagree', 'somewhat_agree', 'strongly_agree'];
  const apiBase = String(window.VOTE_CONFIG?.apiBaseUrl || '').replace(/\/+$/, '');
  const panel = document.getElementById('vote-panel');
  const familiarityRange = document.getElementById('familiarity-rating');
  const agreementRange = document.getElementById('agreement-rating');
  const familiarityValue = document.getElementById('familiarity-value');
  const agreementValue = document.getElementById('agreement-value');
  const submitButton = document.getElementById('vote-submit');
  const exportButton = document.getElementById('vote-export');
  const message = document.getElementById('vote-message');
  const sessionVotes = new Map();
  let current = null;
  let seedTotals = null;

  function apiUrl(path) { return `${apiBase}${path}`; }
  function voteKey(scale, communityId) { return `${scale}|${communityId}`; }
  function currentSessionVote() { return current ? sessionVotes.get(voteKey(current.scale, current.communityId)) || null : null; }
  function setMessage(text, type = '') { message.textContent = text; message.className = `vote-message ${type}`.trim(); }
  function updateLabels() { familiarityValue.textContent = familiarity[Number(familiarityRange.value)]; agreementValue.textContent = agreement[Number(agreementRange.value)]; }

  function setVoteInputs(vote) {
    familiarityRange.value = vote ? Math.max(0, familiarityCodes.indexOf(vote.familiarity)) : 1;
    agreementRange.value = vote ? Math.max(0, agreementCodes.indexOf(vote.agreement)) : 1;
    updateLabels();
    submitButton.textContent = vote ? 'Update vote' : 'Submit vote';
  }

  function emptyStats() {
    return { familiarity: { unfamiliar: 0, somewhat_familiar: 0, very_familiar: 0 }, agreement: { disagree: 0, somewhat_agree: 0, strongly_agree: 0 }, total_votes: 0 };
  }

  function setBar(outputId, barId, count, total) {
    const safeCount = Number(count) || 0;
    const percent = total ? Math.min(100, safeCount / total * 100) : 0;
    const output = document.getElementById(outputId);
    const bar = document.getElementById(barId);
    output.textContent = safeCount;
    bar.style.width = `${percent}%`;
    bar.parentElement.setAttribute('aria-label', `${safeCount} votes, ${Math.round(percent)} percent`);
  }

  function renderStats(stats) {
    const value = stats || emptyStats();
    const total = Number(value.total_votes) || 0;
    setBar('stat-familiarity-low', 'bar-familiarity-low', value.familiarity.unfamiliar, total);
    setBar('stat-familiarity-mid', 'bar-familiarity-mid', value.familiarity.somewhat_familiar, total);
    setBar('stat-familiarity-high', 'bar-familiarity-high', value.familiarity.very_familiar, total);
    setBar('stat-agreement-low', 'bar-agreement-low', value.agreement.disagree, total);
    setBar('stat-agreement-mid', 'bar-agreement-mid', value.agreement.somewhat_agree, total);
    setBar('stat-agreement-high', 'bar-agreement-high', value.agreement.strongly_agree, total);
    document.getElementById('stat-total').textContent = total;
  }

  function storedTotals(row) {
    if (!row) return emptyStats();
    return {
      familiarity: row.familiarity,
      agreement: {
        disagree: row.boundary_match.no_match,
        somewhat_agree: row.boundary_match.moderate_match,
        strongly_agree: row.boundary_match.strong_match
      },
      total_votes: row.total_votes
    };
  }

  async function snapshotStats(scale, communityId) {
    if (!seedTotals) {
      const response = await fetch('data/vote_totals_seed.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('Vote snapshot unavailable');
      seedTotals = await response.json();
    }
    return storedTotals((seedTotals.clusters || []).find(row => Number(row.scale) === scale && row.community_id === communityId));
  }

  async function refreshStats() {
    if (!current) return false;
    try {
      const query = new URLSearchParams({ scale: String(current.scale), community_id: current.communityId });
      const response = await fetch(apiUrl(`/api/votes/stats?${query}`), { cache: 'no-store' });
      if (!response.ok) throw new Error('Shared vote service unavailable');
      const payload = await response.json();
      renderStats(payload.totals);
      return true;
    } catch {
      try { renderStats(await snapshotStats(current.scale, current.communityId)); }
      catch { renderStats(emptyStats()); }
      return false;
    }
  }

  function open(context) {
    current = context;
    document.getElementById('vote-community-name').textContent = `Scale ${context.scale} · Cluster ${String(context.communityNumber).padStart(4, '0')}`;
    document.getElementById('vote-community-meta').textContent = `${context.communitySize.toLocaleString()} block${context.communitySize === 1 ? '' : 's'} · Selected type: ${context.clusterName}`;
    setVoteInputs(currentSessionVote());
    setMessage('');
    panel.hidden = false;
    refreshStats();
  }

  function close(notify = true) {
    panel.hidden = true;
    current = null;
    if (notify) document.dispatchEvent(new CustomEvent('vote-panel-close'));
  }

  async function save() {
    if (!current) return;
    const key = voteKey(current.scale, current.communityId);
    const previous = sessionVotes.get(key) || null;
    const vote = {
      scale: current.scale,
      community_id: current.communityId,
      community_size: current.communitySize,
      familiarity: familiarityCodes[Number(familiarityRange.value)],
      agreement: agreementCodes[Number(agreementRange.value)]
    };
    if (previous) vote.previous_vote = { familiarity: previous.familiarity, agreement: previous.agreement };
    submitButton.disabled = true;
    setMessage('Saving…');
    try {
      const response = await fetch(apiUrl('/api/votes'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(vote) });
      if (!response.ok) throw new Error('Shared vote service unavailable');
      const payload = await response.json();
      sessionVotes.set(key, { familiarity: vote.familiarity, agreement: vote.agreement });
      renderStats(payload.totals);
      setMessage('Anonymous vote saved. You can revise it before leaving the page.', 'success');
    } catch {
      setMessage('Vote was not saved because the shared service is unavailable.', 'error');
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = currentSessionVote() ? 'Update vote' : 'Submit vote';
    }
  }

  function csvEscape(value) { return `"${String(value ?? '').replaceAll('"', '""')}"`; }
  function snapshotCsv(store) {
    const header = ['scale','cluster_id','cluster_size','familiarity_unfamiliar','familiarity_moderately_familiar','familiarity_very_familiar','boundary_no_match','boundary_moderate_match','boundary_strong_match','total_votes','last_updated'];
    const rows = [header, ...(store.clusters || []).map(row => [row.scale,row.community_id,row.community_size,row.familiarity.unfamiliar,row.familiarity.somewhat_familiar,row.familiarity.very_familiar,row.boundary_match.no_match,row.boundary_match.moderate_match,row.boundary_match.strong_match,row.total_votes,row.last_updated])];
    return rows.map(row => row.map(csvEscape).join(',')).join('\r\n');
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function exportVotes() {
    exportButton.disabled = true;
    setMessage('Preparing export…');
    const filename = `shanghai-cluster-votes-${new Date().toISOString().slice(0, 10)}.csv`;
    try {
      const response = await fetch(apiUrl('/api/votes/export.csv'), { cache: 'no-store' });
      if (!response.ok) throw new Error('Shared vote service unavailable');
      download(await response.blob(), filename);
      setMessage('Anonymous vote summary exported.', 'success');
    } catch {
      try {
        if (!seedTotals) seedTotals = await (await fetch('data/vote_totals_seed.json', { cache: 'no-store' })).json();
        download(new Blob(['\ufeff', snapshotCsv(seedTotals)], { type: 'text/csv;charset=utf-8' }), filename);
        setMessage('Latest bundled anonymous vote snapshot exported.', 'success');
      } catch { setMessage('Vote summary is currently unavailable.', 'error'); }
    } finally { exportButton.disabled = false; }
  }

  familiarityRange.addEventListener('input', updateLabels);
  agreementRange.addEventListener('input', updateLabels);
  submitButton.addEventListener('click', save);
  exportButton.addEventListener('click', exportVotes);
  document.getElementById('vote-close').addEventListener('click', () => close(true));
  window.VOTING = { open, close, refreshStats };
})();

