package br.univates.medicalfield.clinico.seguranca;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.proc.SecurityContext;
import com.nimbusds.jose.proc.SingleKeyJWSKeySelector;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.proc.ConfigurableJWTProcessor;
import com.nimbusds.jwt.proc.DefaultJWTClaimsVerifier;
import com.nimbusds.jwt.proc.DefaultJWTProcessor;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyFactory;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Confere o token de acesso (JWT RS256) com a chave pública do ms-auth: assinatura, emissor,
 * público e validade. O ms-clinico nunca emite token; só confere (D-06).
 */
@Component
public class LeitorDeToken {

    static final String EMISSOR = "medicalfield-auth";
    static final String PUBLICO = "medicalfield";
    private static final Set<String> TIPOS_REGISTRO = Set.of("CRM", "COREN", "SOCORRISTA");

    private final ConfigurableJWTProcessor<SecurityContext> processador;

    public LeitorDeToken(@Value("${medicalfield.jwt.chave-publica-arquivo}") String arquivoDaChave) {
        RSAPublicKey chave = lerChavePublica(Path.of(arquivoDaChave));
        DefaultJWTProcessor<SecurityContext> jwt = new DefaultJWTProcessor<>();
        jwt.setJWSKeySelector(new SingleKeyJWSKeySelector<>(JWSAlgorithm.RS256, chave));
        jwt.setJWTClaimsSetVerifier(new DefaultJWTClaimsVerifier<>(
                PUBLICO,
                new JWTClaimsSet.Builder().issuer(EMISSOR).build(),
                Set.of("sub", "sid", "exp", "iat", "tipoRegistro", "perfil")));
        this.processador = jwt;
    }

    /** Lança exceção se o token for inválido, de outra chave, de outro emissor ou vencido. */
    public ProfissionalAutenticado ler(String token) throws Exception {
        JWTClaimsSet claims = processador.process(token, null);
        String tipoRegistro = claims.getStringClaim("tipoRegistro");
        if (!TIPOS_REGISTRO.contains(tipoRegistro)) {
            throw new IllegalArgumentException("tipo de registro desconhecido no token");
        }
        return new ProfissionalAutenticado(
                UUID.fromString(claims.getSubject()),
                UUID.fromString(claims.getStringClaim("sid")),
                claims.getStringClaim("nome"),
                tipoRegistro,
                claims.getStringClaim("registro"),
                // Na dúvida, o menor privilégio
                "ADMIN".equals(claims.getStringClaim("perfil")) ? "ADMIN" : "OPERACIONAL");
    }

    private static RSAPublicKey lerChavePublica(Path arquivo) {
        try {
            String pem = Files.readString(arquivo)
                    .replaceAll("-----(BEGIN|END) PUBLIC KEY-----", "")
                    .replaceAll("\\s", "");
            byte[] der = Base64.getDecoder().decode(pem);
            return (RSAPublicKey) KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(der));
        } catch (IOException e) {
            throw new IllegalStateException("Não foi possível ler a chave pública do JWT em " + arquivo
                    + ". Gere as chaves com infra/scripts/instalar.sh (Linux) ou infra/scripts/gerar-chaves-jwt.ps1 (Windows).", e);
        } catch (Exception e) {
            throw new IllegalStateException("A chave pública do JWT em " + arquivo + " é inválida.", e);
        }
    }
}
