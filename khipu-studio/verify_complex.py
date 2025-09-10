#!/usr/bin/env python3
import json

with open('test_chapter.txt', 'r', encoding='utf-8') as f:
    text = f.read()

with open('test_complex_plan.json', 'r', encoding='utf-8') as f:
    plan = json.load(f)

print('Text length:', len(text))
print()

print("=== VERIFYING CHARACTER POSITIONS ===")
all_positions = []

for chunk in plan['chunks']:
    chunk_id = chunk['id']
    chunk_start, chunk_end = chunk['start_char'], chunk['end_char']
    
    print(f'\nChunk {chunk_id}: {chunk_start}-{chunk_end} (len={chunk_end-chunk_start+1})')
    
    if 'lines' in chunk:
        for i, line in enumerate(chunk['lines']):
            line_start, line_end = line['start_char'], line['end_char']
            line_text = text[line_start:line_end+1]
            voice = line['voice']
            
            # Add to position tracking
            all_positions.extend(range(line_start, line_end + 1))
            
            print(f'  Line {i+1}: {line_start}-{line_end} (len={line_end-line_start+1}) voice={voice}')
            print(f'    Text: {repr(line_text[:80])}{"..." if len(line_text) > 80 else ""}')

print(f"\n=== COVERAGE ANALYSIS ===")
covered_chars = len(set(all_positions))
total_chars = len(text)
coverage_pct = (covered_chars / total_chars) * 100

print(f"Characters covered by lines: {covered_chars}/{total_chars} ({coverage_pct:.1f}%)")

# Find gaps
covered_set = set(all_positions)
gaps = []
for i in range(total_chars):
    if i not in covered_set:
        gaps.append(i)

if gaps:
    print(f"Gaps found at positions: {gaps}")
    for pos in gaps[:10]:  # Show first 10 gaps
        char = text[pos]
        print(f"  Position {pos}: {repr(char)}")
else:
    print("No gaps found - complete coverage!")
