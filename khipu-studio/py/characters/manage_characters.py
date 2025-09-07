#!/usr/bin/env python3
"""
Character Management Module
Handles manual addition, removal, and editing of characters.
"""

import json
import logging
import os
import sys
from pathlib import Path
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict

# Add the project root to the Python path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from py.core.log_utils import get_logger

logger = get_logger("audiobooks.character_manager")

@dataclass
class CharacterEdit:
    """Represents a character with all editable fields"""
    name: str
    type: str = "secondary"  # protagonist, secondary, minor, narrator
    importance: str = "secondary"  # primary, secondary, minor
    gender: str = "unknown"  # male, female, non-binary, unknown
    age: str = "adult"  # child, teen, young_adult, adult, elderly, unknown
    description: str = ""
    personality: List[str] = None
    speaking_style: List[str] = None
    confidence: float = 1.0
    has_dialogue: bool = True
    dialogue_frequency: str = "medium"  # low, medium, high
    frequency: float = 0.5
    accent: str = "neutral"
    custom_added: bool = False  # True if manually added by user
    
    def __post_init__(self):
        if self.personality is None:
            self.personality = []
        if self.speaking_style is None:
            self.speaking_style = []

class CharacterManager:
    """Manages character detection results and manual modifications"""
    
    def __init__(self, project_root: str):
        self.project_root = Path(project_root)
        self.characters_file = self.project_root / "dossier" / "characters.json"
        self.custom_characters_file = self.project_root / "dossier" / "custom_characters.json"
        
        # Ensure dossier directory exists
        self.characters_file.parent.mkdir(parents=True, exist_ok=True)
    
    def load_detected_characters(self) -> List[Dict[str, Any]]:
        """Load the latest detected characters from detect_characters.py output"""
        if not self.characters_file.exists():
            logger.warning("No detected characters file found")
            return []
        
        try:
            with open(self.characters_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                # Handle both direct character list and wrapped format
                if isinstance(data, list):
                    return data
                elif 'characters' in data:
                    return data['characters']
                else:
                    logger.error("Invalid characters file format")
                    return []
        except Exception as e:
            logger.error(f"Error loading detected characters: {e}")
            return []
    
    def load_custom_modifications(self) -> Dict[str, Any]:
        """Load user's custom modifications (additions, removals, edits)"""
        if not self.custom_characters_file.exists():
            return {
                "removed_characters": [],
                "added_characters": [],
                "modified_characters": {}
            }
        
        try:
            with open(self.custom_characters_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error loading custom modifications: {e}")
            return {
                "removed_characters": [],
                "added_characters": [],
                "modified_characters": {}
            }
    
    def save_custom_modifications(self, modifications: Dict[str, Any]) -> None:
        """Save user's custom modifications"""
        try:
            with open(self.custom_characters_file, 'w', encoding='utf-8') as f:
                json.dump(modifications, f, indent=2, ensure_ascii=False)
            logger.info(f"Saved custom modifications to {self.custom_characters_file}")
        except Exception as e:
            logger.error(f"Error saving custom modifications: {e}")
            raise
    
    def get_final_character_list(self) -> List[Dict[str, Any]]:
        """Get the final character list with all modifications applied"""
        detected = self.load_detected_characters()
        modifications = self.load_custom_modifications()
        
        # Start with detected characters
        final_characters = []
        
        # Apply removals and modifications
        for char in detected:
            char_name = char.get('name', '')
            
            # Skip if removed
            if char_name in modifications.get('removed_characters', []):
                logger.info(f"Skipping removed character: {char_name}")
                continue
            
            # Apply modifications if any
            if char_name in modifications.get('modified_characters', {}):
                modified_data = modifications['modified_characters'][char_name]
                char.update(modified_data)
                logger.info(f"Applied modifications to character: {char_name}")
            
            final_characters.append(char)
        
        # Add custom characters
        for custom_char in modifications.get('added_characters', []):
            custom_char['custom_added'] = True
            final_characters.append(custom_char)
            logger.info(f"Added custom character: {custom_char.get('name', 'Unknown')}")
        
        return final_characters
    
    def add_character(self, character: CharacterEdit) -> None:
        """Add a new custom character"""
        modifications = self.load_custom_modifications()
        
        # Convert to dict and mark as custom
        char_dict = asdict(character)
        char_dict['custom_added'] = True
        
        # Add to added characters list
        modifications['added_characters'].append(char_dict)
        
        # Remove from removed list if it was there
        char_name = character.name
        if char_name in modifications.get('removed_characters', []):
            modifications['removed_characters'].remove(char_name)
        
        self.save_custom_modifications(modifications)
        logger.info(f"Added character: {char_name}")
    
    def remove_character(self, character_name: str) -> None:
        """Remove a character (mark as removed)"""
        modifications = self.load_custom_modifications()
        
        # Add to removed list
        if character_name not in modifications.get('removed_characters', []):
            modifications.setdefault('removed_characters', []).append(character_name)
        
        # Remove from added characters if it was custom
        added_chars = modifications.get('added_characters', [])
        modifications['added_characters'] = [
            char for char in added_chars 
            if char.get('name') != character_name
        ]
        
        # Remove from modifications
        if character_name in modifications.get('modified_characters', {}):
            del modifications['modified_characters'][character_name]
        
        self.save_custom_modifications(modifications)
        logger.info(f"Removed character: {character_name}")
    
    def modify_character(self, character_name: str, modifications_dict: Dict[str, Any]) -> None:
        """Modify an existing character"""
        modifications = self.load_custom_modifications()
        
        # Store modifications for this character
        modifications.setdefault('modified_characters', {})[character_name] = modifications_dict
        
        self.save_custom_modifications(modifications)
        logger.info(f"Modified character: {character_name}")
    
    def restore_character(self, character_name: str) -> None:
        """Restore a character to its original detected state"""
        modifications = self.load_custom_modifications()
        
        # Remove from removed list
        if character_name in modifications.get('removed_characters', []):
            modifications['removed_characters'].remove(character_name)
        
        # Remove modifications
        if character_name in modifications.get('modified_characters', {}):
            del modifications['modified_characters'][character_name]
        
        self.save_custom_modifications(modifications)
        logger.info(f"Restored character: {character_name}")
    
    def list_characters(self) -> None:
        """List all current characters with their status"""
        final_characters = self.get_final_character_list()
        modifications = self.load_custom_modifications()
        
        print(f"\n📋 Character List ({len(final_characters)} characters):")
        print("=" * 60)
        
        for char in final_characters:
            name = char.get('name', 'Unknown')
            importance = char.get('importance', 'unknown')
            dialogue_freq = char.get('dialogue_frequency', 'unknown')
            custom = char.get('custom_added', False)
            modified = name in modifications.get('modified_characters', {})
            
            status_icons = []
            if custom:
                status_icons.append("➕ Custom")
            if modified:
                status_icons.append("✏️ Modified")
            
            status = f" ({', '.join(status_icons)})" if status_icons else ""
            
            print(f"• {name:<25} | {importance:<10} | Dialogue: {dialogue_freq:<6}{status}")
        
        removed = modifications.get('removed_characters', [])
        if removed:
            print(f"\n🗑️ Removed Characters ({len(removed)}):")
            for name in removed:
                print(f"• {name}")

def main():
    """Command line interface for character management"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Manage audiobook characters")
    parser.add_argument("project_root", help="Path to project root directory")
    
    subparsers = parser.add_subparsers(dest="command", help="Available commands")
    
    # List command
    list_parser = subparsers.add_parser("list", help="List all characters")
    list_parser.add_argument("--json", action="store_true", help="Output as JSON instead of formatted text")
    
    # Add command
    add_parser = subparsers.add_parser("add", help="Add a new character")
    add_parser.add_argument("name", help="Character name")
    add_parser.add_argument("--type", default="secondary", choices=["protagonist", "secondary", "minor", "narrator"])
    add_parser.add_argument("--importance", default="secondary", choices=["primary", "secondary", "minor"])
    add_parser.add_argument("--gender", default="unknown", choices=["male", "female", "non-binary", "unknown"])
    add_parser.add_argument("--age", default="adult", choices=["child", "teen", "young_adult", "adult", "elderly", "unknown"])
    add_parser.add_argument("--description", default="", help="Character description")
    add_parser.add_argument("--dialogue-frequency", default="medium", choices=["low", "medium", "high"])
    
    # Remove command
    remove_parser = subparsers.add_parser("remove", help="Remove a character")
    remove_parser.add_argument("name", help="Character name to remove")
    
    # Restore command
    restore_parser = subparsers.add_parser("restore", help="Restore a character to original state")
    restore_parser.add_argument("name", help="Character name to restore")
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return
    
    manager = CharacterManager(args.project_root)
    
    if args.command == "list":
        if args.json:
            # Output JSON for programmatic use
            final_characters = manager.get_final_character_list()
            print(json.dumps(final_characters, indent=2, ensure_ascii=False))
        else:
            # Output formatted text for human reading
            manager.list_characters()
    
    elif args.command == "add":
        character = CharacterEdit(
            name=args.name,
            type=args.type,
            importance=args.importance,
            gender=args.gender,
            age=args.age,
            description=args.description,
            dialogue_frequency=args.dialogue_frequency
        )
        manager.add_character(character)
        print(f"✅ Added character: {args.name}")
    
    elif args.command == "remove":
        manager.remove_character(args.name)
        print(f"🗑️ Removed character: {args.name}")
    
    elif args.command == "restore":
        manager.restore_character(args.name)
        print(f"🔄 Restored character: {args.name}")

if __name__ == "__main__":
    main()
