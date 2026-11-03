package br.univates.medicalfield.clinico.comum;

import java.nio.ByteBuffer;
import java.security.SecureRandom;
import java.util.UUID;

/** UUID versão 7 (ordenado pelo tempo), usado quando o cadastro chega sem ID (ex.: pelo Postman). */
public final class Uuids {

    private static final SecureRandom ALEATORIO = new SecureRandom();

    private Uuids() {
    }

    public static UUID v7() {
        long agoraMs = System.currentTimeMillis();
        byte[] bytes = new byte[16];
        ALEATORIO.nextBytes(bytes);
        for (int i = 0; i < 6; i++) {
            bytes[i] = (byte) (agoraMs >>> (40 - 8 * i));
        }
        bytes[6] = (byte) ((bytes[6] & 0x0F) | 0x70); // versão 7
        bytes[8] = (byte) ((bytes[8] & 0x3F) | 0x80); // variante RFC 9562
        ByteBuffer buffer = ByteBuffer.wrap(bytes);
        return new UUID(buffer.getLong(), buffer.getLong());
    }
}
