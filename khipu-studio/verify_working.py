#!/usr/bin/env python3
import json

with open('sample/analysis/chapters_txt/ch01.txt', 'r', encoding='utf-8') as f:
    text = f.read()

with open('test_plan_working.json', 'r', encoding='utf-8') as f:
    plan = json.load(f)

print('Text:', repr(text))
print('Length:', len(text))
print()

for chunk in plan['chunks']:
    chunk_id = chunk['id']
    print(f'Chunk {chunk_id}:')
    chunk_start, chunk_end = chunk['start_char'], chunk['end_char'] 
    chunk_text = text[chunk_start:chunk_end+1]
    print(f'  Chunk: {chunk_start}-{chunk_end} (len={chunk_end-chunk_start+1})')
    print(f'  Text: {repr(chunk_text[:100])}...')
    
    if 'lines' in chunk:
        for i, line in enumerate(chunk['lines']):
            line_start, line_end = line['start_char'], line['end_char']
            line_text = text[line_start:line_end+1]
            voice = line['voice']
            print(f'    Line {i+1}: {line_start}-{line_end} (len={line_end-line_start+1}) voice={voice}')
            print(f'      Text: {repr(line_text)}')
    print()

# Check for gaps or overlaps
print("=== CHECKING LINE COVERAGE ===")
for chunk in plan['chunks']:
    chunk_id = chunk['id']
    chunk_start, chunk_end = chunk['start_char'], chunk['end_char']
    print(f'Chunk {chunk_id} ({chunk_start}-{chunk_end}):')
    
    if 'lines' in chunk:
        covered = set()
        for line in chunk['lines']:
            line_start, line_end = line['start_char'], line['end_char']
            for pos in range(line_start, line_end + 1):
                covered.add(pos)
        
        chunk_positions = set(range(chunk_start, chunk_end + 1))
        uncovered = chunk_positions - covered
        coverage = (len(covered) / len(chunk_positions)) * 100
        
        print(f'  Coverage: {len(covered)}/{len(chunk_positions)} ({coverage:.1f}%)')
        if uncovered:
            gaps = sorted(list(uncovered))
            print(f'  Gaps: {gaps}')
            for pos in gaps[:5]:  # Show first 5 gaps
                char = text[pos] if pos < len(text) else 'EOF'
                print(f'    Position {pos}: {repr(char)}')
        else:
            print(f'  Complete coverage!')
    print()
