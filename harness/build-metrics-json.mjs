#!/usr/bin/env node
/**
 * build-metrics-json.mjs — emit data/metrics.json from one table, and print a census.
 *
 * Generating the JSON rather than hand-writing it means the machine-readable twin
 * cannot drift out of sync with METRICS.md's census, and the JSON is valid by
 * construction.
 *
 * Run: node harness/build-metrics-json.mjs
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../data/metrics.json');

/** Compact row: [id, name, family, formula, unit, range, direction, judge, notes] */
const T = [
  // ---------------- accuracy ----------------
  ['exact_match', 'Exact match', 'accuracy', '1[normalize(pred) == normalize(gold)]', 'indicator', [0, 1], 'higher_is_better', false, 'Primary capability scorer. Must always be reported alongside contains_match so verbosity is visible.'],
  ['relaxed_match', 'Relaxed/soft match', 'accuracy', '1[normalize(pred) contains normalize(gold)]', 'indicator', [0, 1], 'higher_is_better', false, 'Upper bound on exact_match; the gap between them is a length signal, not a capability signal.'],
  ['contains_match', 'Substring contains', 'accuracy', '1[normalize(gold) is a substring of normalize(pred)]', 'indicator', [0, 1], 'higher_is_better', false, 'Favors verbose answers. Never report alone.'],
  ['regex_match', 'Regex match', 'accuracy', '1[re.search(pattern, pred) is not None]', 'indicator', [0, 1], 'higher_is_better', false, 'Implemented in harness/scorers.mjs:regexMatch.'],
  ['token_f1', 'Token-level F1', 'accuracy', '2PR/(P+R) over bag-of-tokens after normalization', 'ratio', [0, 1], 'higher_is_better', false, 'SQuAD-v2 style. [RECALL] definition not re-verified this session.'],
  ['pass_at_1', 'Single-sample accuracy', 'accuracy', 'mean_i 1[correct(x_i, y_1)]', 'ratio', [0, 1], 'higher_is_better', false, 'PRIMARY P1. k=1. For a mean, SE depends only on n*k, so spend the whole budget on items not samples.'],
  ['pass_at_k_unbiased', 'Unbiased pass@k', 'accuracy', '1 - C(n-c,k)/C(n,k)', 'ratio', [0, 1], 'higher_is_better', false, 'Chen et al. 2021 Eq.1, verified verbatim. Convention: if n-c<k return 1.0.'],
  ['pass_at_k_naive', 'Naive pass@k (DO NOT USE)', 'accuracy', '1 - (1-p_hat)^k', 'ratio', [0, 1], 'higher_is_better', false, 'Biased. ALWAYS <= unbiased, by up to 10.58pp at n=200,c=1,k=100. Kept only so the gap is demonstrable.'],
  ['maj_at_k', 'Majority vote @ k', 'accuracy', 'acc(argmax_a sum_j 1[a_j == a])', 'ratio', [0, 1], 'higher_is_better', false, 'Unweighted majority vote; length-normalized weighting was tested and rejected (Wang et al. 2022). Requires a fixed answer set.'],
  ['consistency_k', 'Within-item answer agreement', 'accuracy', 'mean_i sum_a p_i(a)^2 where p_i(a)=count_j[a_j=a]/k', 'ratio', [0.001, 1], 'higher_is_better', false, 'GAMABLE: a consistently wrong model scores 1.0. MUST be reported jointly with accuracy.'],
  ['mean_pairwise_agreement', 'Pairwise sample agreement', 'accuracy', 'mean_{i<j} 1[a_i == a_j]', 'ratio', [0, 1], 'higher_is_better', false, 'Same gaming exposure as consistency_k.'],
  ['partial_credit', 'Fractional credit', 'accuracy', 'mean_i score_i, score_i in [0,1] from the task rubric', 'ratio', [0, 1], 'higher_is_better', false, 'Compresses bimodal outcomes. Use only as a diagnostic alongside binary success.'],

  // ---------------- calibration ----------------
  ['ece_toplabel', 'Expected Calibration Error (top-label)', 'calibration', 'sum_m (|B_m|/n)*|acc(B_m)-conf(B_m)|', 'ratio', [0, 1], 'lower_is_better', false, 'Guo et al. 2017 Eq.3, M=15 bins. M is a convention, not a theorem: ECE falls mechanically as M grows, so M must always be published.'],
  ['mce', 'Maximum Calibration Error', 'calibration', 'max_m |acc(B_m)-conf(B_m)|', 'ratio', [0, 1], 'lower_is_better', false, 'Guo et al. 2017 Eq.5. Use instead of ECE when one high-stakes bin dominates.'],
  ['ace_adaptive', 'Adaptive (classwise/equal-mass) ECE', 'calibration', 'E_m (|B_m|/n)*|acc(B_m)-conf(B_m)| over equal-mass bins', 'ratio', [0, 1], 'lower_is_better', false, '[RECALL] Kull et al. 2019 distinction. Fixes the fixed-mass binning artefact.'],
  ['brier_binary', 'Brier score, single event', 'calibration', '(1/N) sum_i (p_i - o_i)^2', 'ratio', [0, 1], 'lower_is_better', false, 'CONVENTION 1 of 3. Range [0,1]. [RECALL] Brier 1950 primary text not re-verified.'],
  ['brier_sum', 'Brier, C-class SUM', 'calibration', '(1/N) sum_i sum_c (p_ic - y_ic)^2', 'ratio', [0, 2], 'lower_is_better', false, 'CONVENTION 2 of 3. Range is [0, 1+1/(C-1)]: 2 for C=2, 1.5 for C=3, 1.111 for C=10. NOT comparable to brier_binary.'],
  ['brier_mean', 'Brier, C-class MEAN', 'calibration', 'brier_sum / C', 'ratio', [0, 1], 'lower_is_better', false, 'CONVENTION 3 of 3. Range [0, (1+1/(C-1))/C]. A Brier number without its convention and class count is meaningless.'],
  ['nll', 'Negative log-likelihood', 'calibration', '-(1/N) sum_i log pi_hat(y_i|x_i)', 'ratio', [0, null], 'lower_is_better', false, 'Proper scoring rule; not binning-dependent. Preferred over ECE for cross-harness comparability.'],
  ['overconfidence_rate', 'Overconfidence rate', 'calibration', 'mean_i 1[p_hat_i > y_i] * (p_hat_i - y_i)', 'ratio', [0, 1], 'lower_is_better', false, 'Signed excess confidence on wrong answers only.'],
  ['auroc_abstention', 'AUROC of the correctness signal', 'calibration', 'AUROC separating correct from incorrect using p_hat', 'ratio', [0, 1], 'higher_is_better', false, 'Answers "can it tell when it is wrong", independent of threshold. [RECALL] Hanley & McNeil 1982.'],
  ['selective_risk_R', 'Selective risk at coverage R', 'calibration', 'error rate among the R most-confident items', 'ratio', [0, 1], 'lower_is_better', false, 'NEVER report a single (risk, coverage) point: abstaining on everything trivially minimises risk. Report the curve.'],
  ['risk_coverage_curve', 'Risk-coverage curve', 'calibration', '{(coverage(c), risk(c)) : c in [0,1]}', 'curve', [0, 1], 'lower_is_better', false, 'The honest deliverable for the safety-utility trade-off. [RECALL] El-Yaniv & Wiener 2010.'],
  ['aurc', 'Area under risk-coverage', 'calibration', 'integral of risk(c) dc', 'ratio', [0, 1], 'lower_is_better', false, 'Not comparable across different abstention policies. [RECALL] Geifman & El-Yaniv 2017.'],

  // ---------------- long_context ----------------
  ['ecl_absolute', 'Effective context length, absolute rule', 'long_context', 'max{L : score(L) >= 85.6%}', 'tokens', [0, null], 'higher_is_better', false, 'Hsieh et al. 2024 (RULER). Threshold is ABSOLUTE (Llama2-7B@4K = 85.6%), not relative to the model own short-context score. ORDER-DEPENDENT if the sweep is non-monotone: verified {4k:85.0,8k:86.0,16k:30.0} -> ECL=8192. Always publish the full curve.'],
  ['ecl_relative', 'Effective context length, self-referenced', 'long_context', 'max{L : score(L) >= alpha * score(L_short)}', 'tokens', [0, null], 'higher_is_better', false, 'Our construction. Exists because ecl_absolute has at least three rival published meanings; name the rule in the column header every time.'],
  ['needle_accuracy', 'Single-needle retrieval accuracy', 'long_context', '1[needle value appears in output]', 'ratio', [0, 1], 'higher_is_better', false, 'A LOWER BOUND on retrieval, not a measure of understanding: a model can pattern-match a literal string.'],
  ['multi_needle_recall', 'Multi-needle recall', 'long_context', '#needles recovered / #needles inserted', 'ratio', [0, 1], 'higher_is_better', false, 'Recall-based, per RULER.'],
  ['position_spread', 'Best-minus-worst across needle position', 'long_context', 'max_pos acc - min_pos acc', 'ratio', [0, 1], 'lower_is_better', false, 'OUR construction from the Liu et al. 2023 protocol; that paper defines NO metric symbol and NO named benchmark. This is the citable object.'],
  ['position_curvature', 'U-shape / primacy-recency curvature', 'long_context', 'second difference of accuracy across position bins', 'ratio', null, 'lower_is_better', false, 'Liu et al. name the phenomenon the serial-position effect (Ebbinghaus 1913). The U-shape requires sufficient scale: 7B Llama-2 is solely recency-biased.'],
  ['kv_retrieval_accuracy', 'Synthetic KV retrieval accuracy', 'long_context', 'exact-value accuracy as a function of key position', 'ratio', [0, 1], 'higher_is_better', false, 'UUID key-value pairs; minimal natural-language confounds (Liu et al. design intent).'],
  ['cliff_index', 'Context-length cliff', 'long_context', 'max single-interval accuracy drop / interval size', 'ratio', [0, 1], 'lower_is_better', false, 'Grid-sensitive: a coarse grid averages a cliff away. The grid must be pre-registered.'],
  ['context_utilization', 'Fraction of context actually attended to', 'long_context', 'tokens attended to / tokens supplied', 'ratio', [0, 1], 'higher_is_better', true, 'NOT COMPUTABLE through our interface (needs logit/attention access). EXCLUDED from primaries.'],

  // ---------------- efficiency ----------------
  ['ttft_spawn', 'TTFT from process spawn', 'efficiency', 't(first non-empty text) - t(spawn)', 'ms', [0, null], 'lower_is_better', false, 'Includes 8-14s of CLI boot. Report alongside ttft_model but NEVER headline it.'],
  ['ttft_model', 'TTFT, boot-excluded', 'efficiency', 't(first non-empty text) - t(first provider event)', 'ms', [0, null], 'lower_is_better', false, 'PRIMARY P5. Report MEDIAN and IQR, not mean. Already implemented correctly at harness/runner.mjs:183.'],
  ['itl_mean', 'Inter-token latency', 'efficiency', '(t(last)-t(first)) / (n_out_tokens - 1)', 'ms/token', [0, null], 'lower_is_better', false, 'Strongly right-skewed. Publish the distribution: the mean is dominated by the slowest tokens. Undefined for 0-token answers, which our harness classifies as retryable failures.'],
  ['output_tps', 'Output throughput', 'efficiency', 'n_out_tokens / (t(last) - t(first))', 'tokens/s', [0, null], 'higher_is_better', false, ''],
  ['total_latency', 'End-to-end latency', 'efficiency', 't(last event) - t(spawn)', 'ms', [0, null], 'lower_is_better', false, ''],
  ['cost_per_1k_tokens', 'Price per 1K tokens', 'efficiency', 'cost / (tokens/1000)', 'currency', [0, null], 'lower_is_better', false, 'Requires a dated vendor price list. Tag PRICED, never MEASURED.'],
  ['cost_per_solved_task', 'Cost per solved task (measured)', 'efficiency', 'total_cost / #tasks_solved', 'currency/task', [0, null], 'lower_is_better', false, 'DEGENERATE for our free-tier subject: cost=0 for every model including one that solves nothing, so it reports 0/inf. Do not report as measured. Replaced by shadow_cost_per_solved_task.'],
  ['shadow_cost_per_solved_task', 'Token-priced cost per solved task', 'efficiency', 'sum(shadow_price_l * tokens_l) / #tasks_solved', 'currency/task', [0, null], 'lower_is_better', false, 'PRIMARY P6. Price list must be dated and printed next to the number. Missing price = MISSING cell, never imputed to zero.'],
  ['tokens_per_tool_call', 'Output tokens per tool call', 'efficiency', 'n_out_tokens / n_tool_calls', 'tokens', [0, null], 'lower_is_better', false, 'Inversely related to trajectory_efficiency in a way that can be gamed (fewer, larger steps). Report both.'],
  ['parallel_scaling_efficiency', 'Parallel efficiency', 'efficiency', 'T_sequential / (T_parallel * n_workers)', 'ratio', [0, 1], 'higher_is_better', false, ''],
  ['intelligence_per_dollar', 'Intelligence per dollar', 'efficiency', 'primary_accuracy / cost_per_solved_task', 'acc/currency', [0, null], 'higher_is_better', false, 'GAMABLE: maximised by a model that is free and bad. Secondary tier only; never report alone.'],

  // ---------------- agentic ----------------
  ['task_success_rate', 'Binary task success', 'agentic', 'mean_i 1[final state passes deterministic checker]', 'ratio', [0, 1], 'higher_is_better', false, 'PRIMARY P2. Checker MUST be a program. Final-state assertion is the least gameable success criterion.'],
  ['trajectory_efficiency', 'Step efficiency', 'agentic', 'min(1, optimal_steps / actual_steps)', 'ratio', [0, 1], 'higher_is_better', false, 'optimal_steps is a property of the TASK and encodes the authors own bias. Gameable by taking fewer, larger steps.'],
  ['tool_call_precision', 'Tool-call precision', 'agentic', 'TP / (TP + FP) over emitted calls', 'ratio', [0, 1], 'higher_is_better', false, 'No single standard definition exists; ours is a construction. Label it as such.'],
  ['tool_call_recall', 'Tool-call recall', 'agentic', 'TP / (TP + FN) against a reference plan', 'ratio', [0, 1], 'higher_is_better', false, 'Requires a defensible reference plan.'],
  ['tool_call_f1', 'Tool-call F1', 'agentic', 'harmonic mean of tool_call_precision and tool_call_recall', 'ratio', [0, 1], 'higher_is_better', false, ''],
  ['argument_correctness', 'Tool-argument correctness', 'agentic', 'mean_calls 1[args match required schema and values]', 'ratio', [0, 1], 'higher_is_better', false, 'Separates right-tool-wrong-args from right-tool-right-args, which success rate alone hides.'],
  ['error_recovery_rate', 'Recovery after a failed tool call', 'agentic', 'mean 1[failed call AND final state correct] / #failed calls', 'ratio', [0, 1], 'higher_is_better', false, 'SELECTION EFFECT: conditioned on failing, a model that never fails has no denominator and a model that fails more often gets more chances. MUST be reported jointly with the failure rate.'],
  ['plan_adherence', 'Adherence to a reference plan', 'agentic', 'LCS(emitted order, reference order) / len(reference)', 'ratio', [0, 1], 'higher_is_better', false, 'Only valid where a reference trajectory genuinely exists; otherwise it measures conformity to our authorial style.'],
  ['state_tracking_correctness', 'Environment state fidelity', 'agentic', 'mean 1[final env state == expected]', 'ratio', [0, 1], 'higher_is_better', false, 'Deterministic. Preferred over judge-scored success.'],
  ['long_horizon_slope', 'Per-step success decay', 'agentic', 'OLS slope of per-step success on step index', 'pp/step', null, 'toward_zero', false, 'DENOMINATOR TRAP: harness/runner.mjs:190 counts stepFinishes = LLM API steps, NOT agent/tool steps. A model packing 10 tool calls per LLM step shows an artificially flat slope. Confirm the definition with B1 before use.'],
  ['human_intervention_rate', 'Human handoff rate', 'agentic', '#tasks needing intervention / #tasks', 'ratio', [0, 1], 'lower_is_better', false, ''],
  ['time_horizon_50', '50% task-completion time horizon', 'agentic', 'p_success = sigma((log h_model - log t_task) * beta_model); report h_model', 'duration', [0, null], 'higher_is_better', false, 'METR (Kwa et al. 2025). t_task = geometric mean HUMAN wall-clock time of successful baselines. NOT COMPUTABLE for us: our task lengths sit on one side of the logistic so h_model is unidentified. EXCLUDED from primaries.'],

  // ---------------- instruction_following ----------------
  ['ifeval_prompt_strict', 'IFEval prompt-level strict accuracy', 'instruction_following', 'mean_prompts 1[ALL verifiable instructions in the prompt are followed]', 'ratio', [0, 1], 'higher_is_better', false, 'Zhou et al. 2023. AND-aggregated over instructions within a prompt.'],
  ['ifeval_inst_strict', 'IFEval instruction-level strict accuracy', 'instruction_following', 'mean_instructions 1[instruction followed]', 'ratio', [0, 1], 'higher_is_better', false, 'PRIMARY P3. Program-verified, judge-free. Cluster-bootstrap over PROMPTS, not instructions: instructions within a prompt are correlated.'],
  ['ifeval_prompt_loose', 'IFEval prompt-level loose accuracy', 'instruction_following', 'prompt-level accuracy under any of 8 response transforms', 'ratio', [0, 1], 'higher_is_better', false, 'Authors: loose is a COMPLEMENT to strict, not a replacement, because it introduces false positives.'],
  ['ifeval_inst_loose', 'IFEval instruction-level loose accuracy', 'instruction_following', 'instruction-level accuracy under any of 8 response transforms', 'ratio', [0, 1], 'higher_is_better', false, 'The 8 transforms: identity, strip markdown font modifiers, drop first line, drop last line, + all pairwise and 3-way combos.'],
  ['json_schema_conformance', 'JSON-schema conformance', 'instruction_following', '1[parsed value validates against the schema]', 'ratio', [0, 1], 'higher_is_better', false, 'Deterministic. Implemented in harness/scorers.mjs:jsonSchema.'],
  ['format_violation_rate', 'Format violation rate', 'instruction_following', '1[output violates the stated format constraint]', 'ratio', [0, 1], 'lower_is_better', false, ''],
  ['constraint_violation_severity', 'Severity-weighted violation', 'instruction_following', 'sum_j severity_j * 1[violated_j] / #constraints', 'ratio', [0, 1], 'lower_is_better', false, 'severity_j is an AUTHORIAL PRIOR dressed as a measurement. Always ship the unweighted violation count alongside.'],
  ['prompt_robustness_delta', 'Robustness under perturbation', 'instruction_following', 'metric(clean) - metric(perturbed), averaged over perturbation types', 'ratio', [-1, 1], 'lower_is_better', false, 'Perturbation set must be pre-registered.'],

  // ---------------- multilingual ----------------
  ['accuracy_lang', 'Per-language accuracy', 'multilingual', 'mean accuracy over items in that language', 'ratio', [0, 1], 'higher_is_better', false, 'Never report as a single average. See macro/micro.'],
  ['lang_gap_vs_en', 'Gap vs English', 'multilingual', 'acc_en - acc_lang', 'ratio', [-1, 1], 'lower_is_better', false, 'English is the CHEAPEST language for every subword BPE tokenizer tested, so gaps measured only against English overstate typical disparity.'],
  ['macro_avg_accuracy', 'Macro-average across languages', 'multilingual', 'mean over languages, equal weight each', 'ratio', [0, 1], 'higher_is_better', false, 'Equal weight per language. Disagrees with micro in DIRECTION, not just magnitude.'],
  ['micro_avg_accuracy', 'Micro-average across languages', 'multilingual', 'mean over all items', 'ratio', [0, 1], 'higher_is_better', false, 'Weights by item count. Report BOTH; a large gap between them is itself the finding.'],
  ['tokens_per_char', 'Tokenizer efficiency per character', 'multilingual', 'n_tokens / n_chars', 'tokens/char', [0, null], 'lower_is_better', false, 'Drives cost, latency and effective context simultaneously. Measure on OUR subject tokenizer; the subject tokenizer is not published to us, so this must never be imported from the literature.'],
  ['tokens_per_word', 'Tokenizer efficiency per word', 'multilingual', 'n_tokens / n_words', 'tokens/word', [0, null], 'lower_is_better', false, ''],
  ['tokenization_premium', 'Premium relative to English', 'multilingual', 'ratio_lang / ratio_en', 'ratio', [1, null], 'lower_is_better', false, 'Petrov et al. 2023: disparities up to 15x for subword BPE, over 4x even for char/byte models. The multiplier is TOKENIZER-SPECIFIC (Korean: 5.07x on GPT-2 but 2.38x on cl100k), so any premium claim must name the tokenizer.'],
  ['translation_adequacy', 'Translation adequacy proxy', 'multilingual', 'task-judged semantic preservation of the source meaning', 'ratio', [0, 1], 'higher_is_better', true, 'No accepted cheap deterministic proxy. An LLM judge is least reliable exactly in the languages where we are weakest. Exploratory only.'],

  // ---------------- robustness_safety ----------------
  ['over_refusal_full', 'Over-refusal rate (full refusal)', 'robustness_safety', '#full refusals on safe prompts / #safe prompts', 'ratio', [0, 1], 'lower_is_better', true, 'XSTest 250 safe prompts, 10 types. Full refusal includes offering only alternatives. Must be reported jointly with unsafe_refusal_rate.'],
  ['over_refusal_partial', 'Over-refusal rate (partial refusal)', 'robustness_safety', '#partial refusals on safe prompts / #safe prompts', 'ratio', [0, 1], 'lower_is_better', true, 'Full + partial + compliance = 100%. NOTE the XSTest paper has an internal typo: section 4.3 says 200 safe, the abstract and all tables say 250.'],
  ['unsafe_refusal_rate', 'Refusal rate on unsafe contrasts', 'robustness_safety', '#refusals on unsafe prompts / #unsafe prompts', 'ratio', [0, 1], 'higher_is_better', true, 'XSTest 200 unsafe contrasts. The safety-utility trade-off only has meaning as a CURVE.'],
  ['jailbreak_success_rate', 'Jailbreak success rate', 'robustness_safety', '#prompts yielding compliance / #jailbreak attempts', 'ratio', [0, 1], 'lower_is_better', true, 'No canonical first-party definition verified.'],
  ['prompt_injection_success_rate', 'Prompt-injection success rate (agent setting)', 'robustness_safety', '#runs where injected content changed behaviour / #runs', 'ratio', [0, 1], 'lower_is_better', false, 'Prefer the CANARY form: plant a unique string in tool output, check for reappearance in the final answer or in a tool argument. Deterministic, no judge, unambiguous ground truth.'],
  ['refusal_precision', 'Refusal precision', 'robustness_safety', 'TP / #refusals', 'ratio', [0, 1], 'higher_is_better', true, 'Over-refusal is the false-positive side.'],
  ['refusal_recall', 'Refusal recall', 'robustness_safety', 'TP / #truly unsafe prompts', 'ratio', [0, 1], 'higher_is_better', true, ''],
  ['pii_leak_rate', 'PII leakage rate', 'robustness_safety', '#items where a planted canary appears in output / #items', 'ratio', [0, 1], 'lower_is_better', false, 'Canary form is deterministic and judge-free.'],
  ['harmfulness_rate', 'Harmfulness rate', 'robustness_safety', 'graded', 'ratio', [0, 1], 'lower_is_better', true, 'No deterministic route. If judged, subject to every artifact in PSYCHOMETRICS.md section 3.'],

  // ---------------- hallucination ----------------
  ['simpleqa_correct_rate', 'SimpleQA overall-correct rate', 'hallucination', 'c / N', 'ratio', [0, 1], 'higher_is_better', true, 'Wei et al. 2024. One of three RAW rates that should be the actual deliverable.'],
  ['simpleqa_correct_given_attempted', 'SimpleQA correct-given-attempted', 'hallucination', 'c / (c + i)', 'ratio', [0, 1], 'higher_is_better', true, 'Rewards abstention. The tension with overall-correct is the entire point of the benchmark.'],
  ['simpleqa_f', 'SimpleQA F-score', 'hallucination', '2c / (2c + 2i + n)', 'ratio', [0, 1], 'higher_is_better', true, 'UNWEIGHTED harmonic mean of the two rates above - it does NOT weight the three categories. Verified numerically against 6/6 published rows. KNOWN GAMING DIRECTION: below 50% accuracy, guessing dominates. Exploratory only.'],
  ['factscore', 'FActScore', 'hallucination', 'mean over atomic facts a in A_y of 1[a supported by knowledge source C]', 'ratio', [0, 1], 'higher_is_better', true, 'PRECISION ONLY - no recall, no F1, no F score. Labels are Supported / Not-supported / Irrelevant; contradicted is NOT a label. Authors: does not penalise abstaining or emitting few facts. NOT COMPUTABLE for us (needs a knowledge source + NLI annotator). EXCLUDED from primaries.'],
  ['citation_correctness', 'Citation entailment correctness', 'hallucination', '#citations entailed by the generated text / #citations', 'ratio', [0, 1], 'higher_is_better', true, ''],
  ['attribution_precision', 'Attribution precision', 'hallucination', 'same as factscore', 'ratio', [0, 1], 'higher_is_better', true, 'Separate from recall, which FActScore does not provide.'],

  // ---------------- judge_validity (diagnostics about our HARNESS) ----------------
  ['position_swap_delta', 'Judge position-swap delta', 'judge_validity', '|score(A before B) - score(B before A)|', 'ratio', [0, 1], 'lower_is_better', true, 'DIAGNOSTIC ABOUT THE JUDGE, not the subject. If non-zero the judge is order-dependent.'],
  ['verbosity_correlation', 'Judge verbosity correlation', 'judge_validity', 'corr(judge score, response length)', 'ratio', [-1, 1], 'toward_zero', true, 'A strong positive value means the judge is rewarding length.'],
  ['self_preference_delta', 'Self-preference delta', 'judge_validity', '|score with identity - score with identity stripped|', 'ratio', [0, 1], 'lower_is_better', true, 'DIAGNOSTIC. Test by re-grading human-labelled pairs with model names and self-referential phrasing removed. Using a DIFFERENT-FAMILY judge removes the dominant term but NOT the judge own family preference.'],
  ['inter_judge_agreement', 'Inter-judge agreement', 'judge_validity', 'Cohen kappa (2 raters) or Krippendorff alpha (>2, with missing data)', 'ratio', [-1, 1], 'higher_is_better', true, 'If below ~0.6 the judge is not a measurement instrument and every metric it touches must be demoted to exploratory.'],
  ['shuffle_control_false_positive_rate', 'Judge shuffle-control FPR', 'judge_validity', 'P(judge scores a wrong answer as fully correct)', 'ratio', [0, 1], 'lower_is_better', true, 'Mandatory sanity control: grade gold-vs-gold (expect ~1.0) and gold-vs-shuffled-wrong (expect the FPR). A judge failing the shuffle control is unusable at any alpha.'],

  // ---------------- effect_size ----------------
  ['standardized_diff', 'Standardized difference (Cohen d)', 'effect_size', '(p_A - p_B) / sqrt((p_A(1-p_A) + p_B(1-p_B))/2)', 'ratio', null, 'signed', false, 'Use when the two scores come from different harnesses or different n.'],
  ['rank_correlation', 'Spearman rank correlation across metrics', 'effect_size', 'rho between two models per-metric ranks', 'ratio', [-1, 1], 'signed', false, 'Use to compare two whole PROFILES when raw scores are not comparable.'],
  ['sign_test_wins', 'Wins across metrics (sign test)', 'effect_size', '#metrics where model wins, vs m/2', 'count', [0, null], 'higher_is_better', false, 'PRIMARY P7. 5 models x 15 metrics = 75 cells: chance gives 37.5, sd 4.33. Needs >=48/75 before beats-chance.'],
  ['normalized_score', 'Normalized cross-harness score', 'effect_size', 'z-score or min-max of a metric across models', 'ratio', null, 'higher_is_better', false, 'Only valid WITHIN one harness and one item set. Never across harnesses.'],
];

const REQUIRED = ['id', 'name', 'family', 'formula', 'unit', 'range', 'direction', 'higher_is_better', 'computable_without_hidden_ground_truth', 'notes'];
const DIRECTIONS = new Set(['higher_is_better', 'lower_is_better', 'toward_zero', 'signed']);

const metrics = T.map(([id, name, family, formula, unit, range, direction, judge, notes], i) => {
  if (!DIRECTIONS.has(direction)) throw new Error(`#${i} ${id}: bad direction ${direction}`);
  return {
    id, name, family, formula, unit,
    range: range === null ? null : { min: range[0], max: range[1] },
    direction,
    higher_is_better: direction === 'higher_is_better',
    computable_without_hidden_ground_truth: !judge,
    notes,
  };
});

// ---- integrity checks -------------------------------------------------------
const ids = metrics.map((m) => m.id);
const dupes = ids.filter((v, i) => ids.indexOf(v) !== i);
if (dupes.length) throw new Error(`duplicate ids: ${[...new Set(dupes)].join(', ')}`);
for (const m of metrics) for (const k of REQUIRED) if (!(k in m)) throw new Error(`${m.id}: missing key ${k}`);
if (new Set(metrics.map((m) => m.family)).size < 5) throw new Error('suspiciously few families');

// every pre-registered primary and every declared exclusion must be a real id
const PRIMARIES = ['pass_at_1', 'task_success_rate', 'ifeval_inst_strict', 'accuracy_lang',
                   'ttft_model', 'shadow_cost_per_solved_task', 'sign_test_wins'];
const EXCLUDED = ['context_utilization', 'time_horizon_50', 'factscore', 'translation_adequacy', 'cost_per_solved_task'];
for (const id of [...PRIMARIES, ...EXCLUDED]) {
  if (!ids.includes(id)) throw new Error(`pre-registration references unknown metric id: ${id}`);
  if (PRIMARIES.includes(id)) {
    const m = metrics.find((x) => x.id === id);
    if (!m.computable_without_hidden_ground_truth) {
      throw new Error(`PRIMARY ${id} is judge-dependent — contradicts the pre-registration claim that all primaries are judge-free`);
    }
  }
}
// no primary may be a primary AND declared excluded
for (const id of PRIMARIES) if (EXCLUDED.includes(id)) throw new Error(`${id} is both primary and excluded`);

const doc = {
  $schema: 'internal://llm-bench/metrics/v1',
  generated_by: 'harness/build-metrics-json.mjs',
  generated_on: '2026-09-27',
  owner: 'A2 (Standards Lab)',
  subject: 'opencode/space-bunny-free',
  doc: 'harness/METRICS.md',
  psychometrics_doc: 'harness/PSYCHOMETRICS.md',
  verification: {
    numeric_self_tests: 'harness/psycho-verify.mjs',
    run: 'node harness/psycho-verify.mjs',
    note: 'All formulas marked VERIFIED in metrics.json notes were re-derived and self-tested. Formulas marked [RECALL] in METRICS.md Appendix B were cited from memory and NOT re-verified online.',
  },
  conventions: {
    direction: 'higher_is_better | lower_is_better | toward_zero | signed',
    computable_without_hidden_ground_truth:
      'true  = a deterministic checker suffices (no LLM judge, no hidden ground truth). ' +
      'false = requires an LLM judge or privileged access (logits/KV/knowledge source), OR is undefined for a free-tier subject. ' +
      'Metrics with false are EXCLUDED from the pre-registered primary set by default.',
    range: 'null means unbounded. For brier_* the range is CONVENTION-DEPENDENT and is stated per-entry.',
  },
  pre_registration: {
    doc_section: 'harness/PSYCHOMETRICS.md section 5.7',
    primaries: PRIMARIES,
    primary_parameterisations: {
      accuracy_lang: 'language=ko (the pre-registered instance of this metric; its paired cost twin is tokenization_premium with language=ko)',
      ifeval_inst_strict: 'cluster-bootstrap over PROMPTS, not instructions',
      ttft_model: 'median + IQR, boot-excluded; median used in the test',
    },
    excluded_by_design: EXCLUDED,
    correction: { primaries: 'Holm across 7 primaries', secondary: 'Benjamini-Hochberg FDR=0.10, reported as exploratory' },
    min_n_for_5pt_gap: { unpaired_p50: 1562, paired_q20: 628, paired_q10: 314, note: 'alpha=.05 two-sided, power=.80' },
  },
  census: {},
  metrics,
};

// ---- census -----------------------------------------------------------------
for (const m of metrics) {
  const c = doc.census[m.family] ??= { count: 0, judge_dependent: 0 };
  c.count++;
  if (!m.computable_without_hidden_ground_truth) c.judge_dependent++;
}
doc.census.total = metrics.length;
doc.census.judge_dependent_total = metrics.filter((m) => !m.computable_without_hidden_ground_truth).length;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n');
// re-parse to prove the file on disk is valid JSON
JSON.parse(readBack(OUT));

function readBack(p) { return readFileSync(p, 'utf8'); }

console.log(`wrote ${OUT}`);
console.log(`metrics: ${doc.census.total}   judge-dependent (computable=false): ${doc.census.judge_dependent_total}`);
console.log('by family:');
for (const [f, c] of Object.entries(doc.census)) {
  if (f === 'total' || f === 'judge_dependent_total') continue;
  console.log(`  ${f.padEnd(22)} ${String(c.count).padStart(3)}   (judge-dependent: ${c.judge_dependent})`);
}
