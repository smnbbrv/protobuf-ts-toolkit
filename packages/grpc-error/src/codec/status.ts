import { BinaryReader, BinaryWriter, WireType } from '@protobuf-ts/runtime';

/**
 * Minimal implementation of google.rpc.Status for parsing/encoding grpc-status-details-bin.
 */
export interface Status {
  code: number;
  message: string;
  details: Any[];
}

/**
 * Minimal implementation of google.protobuf.Any for error details.
 */
export interface Any {
  typeUrl: string;
  value: Uint8Array;
}

/**
 * Parse a google.rpc.Status from binary data.
 */
export function parseStatus(data: Uint8Array): Status {
  const reader = new BinaryReader(data);
  const status: Status = {
    code: 0,
    message: '',
    details: [],
  };

  while (reader.pos < data.length) {
    const [fieldNo, wireType] = reader.tag();

    switch (fieldNo) {
      case 1: // code
        if (wireType === WireType.Varint) {
          status.code = reader.int32();
        } else {
          reader.skip(wireType);
        }
        break;
      case 2: // message
        if (wireType === WireType.LengthDelimited) {
          status.message = reader.string();
        } else {
          reader.skip(wireType);
        }
        break;
      case 3: // details
        if (wireType === WireType.LengthDelimited) {
          const anyBytes = reader.bytes();
          status.details.push(parseAny(anyBytes));
        } else {
          reader.skip(wireType);
        }
        break;
      default:
        reader.skip(wireType);
    }
  }

  return status;
}

/**
 * Parse a google.protobuf.Any from binary data.
 */
export function parseAny(data: Uint8Array): Any {
  const reader = new BinaryReader(data);
  const any: Any = {
    typeUrl: '',
    value: new Uint8Array(0),
  };

  while (reader.pos < data.length) {
    const [fieldNo, wireType] = reader.tag();

    switch (fieldNo) {
      case 1: // type_url
        if (wireType === WireType.LengthDelimited) {
          any.typeUrl = reader.string();
        } else {
          reader.skip(wireType);
        }
        break;
      case 2: // value
        if (wireType === WireType.LengthDelimited) {
          any.value = reader.bytes();
        } else {
          reader.skip(wireType);
        }
        break;
      default:
        reader.skip(wireType);
    }
  }

  return any;
}

/**
 * Encode a google.rpc.Status to binary data.
 */
export function encodeStatus(status: Status): Uint8Array {
  const writer = new BinaryWriter();

  if (status.code !== 0) {
    writer.tag(1, WireType.Varint).int32(status.code);
  }

  if (status.message) {
    writer.tag(2, WireType.LengthDelimited).string(status.message);
  }

  for (const detail of status.details) {
    writer.tag(3, WireType.LengthDelimited).bytes(encodeAny(detail));
  }

  return writer.finish();
}

/**
 * Encode a google.protobuf.Any to binary data.
 */
export function encodeAny(any: Any): Uint8Array {
  const writer = new BinaryWriter();

  if (any.typeUrl) {
    writer.tag(1, WireType.LengthDelimited).string(any.typeUrl);
  }

  if (any.value.length > 0) {
    writer.tag(2, WireType.LengthDelimited).bytes(any.value);
  }

  return writer.finish();
}
