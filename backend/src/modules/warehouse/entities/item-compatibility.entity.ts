import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Item } from './item.entity';

/** Совместимость: картридж ↔ модели принтеров, к которым он подходит. */
@Entity({ name: 'item_compatibility', synchronize: false })
export class ItemCompatibility {
  @PrimaryColumn({ name: 'item_id' })
  itemId: string;

  @PrimaryColumn({ name: 'compatible_item_id' })
  compatibleItemId: string;

  @ManyToOne(() => Item, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @ManyToOne(() => Item, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'compatible_item_id' })
  compatibleItem: Item;
}
