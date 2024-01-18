---
title: "Effective Java - 아이템 5: 자원을 직접 명시하지 말고 의존 객체 주입을 사용하라"
categories:
  - Effective Java
tags:
  - Effective Java
toc: true
toc_sticky: true
toc_label: ""
toc_icon: ""
---

```java
// 정적 유틸리티를 잘못 사용한 예 - 유연하지 않고 테스트하기 어렵다.
public class SpellChecker {
    private static final Lexicon dictionary = ...;
    
    private SpellChecker() {} // 객체 생성 방지
    
    public static boolean isValid(String word) { ... }
    public static List<String> suggestions(String typo) { ... }
}
```

```java
// 싱글턴을 잘못 사용한 예 - 유연하지 않고 테스트하기 어렵다.
public class SpellChecker {
    private final Lexicon dictionary = ...;
    
    private SpellChecker(...) {}
    public static SpellChecker INSTANCE = new SpellChecker(...);
    
    public boolean isValid(String word) { ... }
    public List<String> suggestions(String typo) { ... }
}
```

> 두 방식 모두 사전을 단 하나만 사용한다고 가정하는 코드이다.<br>
> 다른 여러가지 사전을 사용해야 한다면 코드를 교체하는 작업이 힘들다.<br>
> 사용하는 자원에 따라 동작이 달라지는 클래스에는 정적 유틸리티 클래스나 싱글턴 방식이 적합하지 않다.<br>

### 유연하게 사용하는 방법
유연하게 변경하려면 클래스가 여러 자원 인스턴스를 지원해야 하며, 클라이언트가 원하는 자원을 사용해야 한다.<br>
**인스턴스를 생성할 때 생성자에 필요한 자원을 넘겨주는 방식**이다.

```java
// 생성자 의존성 주입 패턴
public class SpellChecker {
    private final Lexicon dictionary;
    
    public SpellChecker(Lexicon dictionary) {
        this.dictionary = Objects.requireNonNull(dictionary);
    }
    
    public boolean isValid(String word) { ... }
    public List<String> suggestions(String typo) { ... }
}
```

> 의존 객체 주입 패턴은 자원이 몇 개든 의존 관계가 어떻든 상관없이 잘 작동한다.<br>
또한 불변 을 보장하여 여러 클라이언트가 의존 객체들을 안심하고 공유할 수 있다.<br>
의존 객체 주입은 생성자, 정적 팩터리, 빌더 모두에 똑같이 응용할 수 있다.

이 패턴의 변형으로 생성자에 자원 팩터리를 넘겨주는 방식이 있다.<br>
**팩터리란 호출할 때마다 특정 타입의 인스턴스를 반복해서 만들어주는 객체를 말한다.**<br>
즉 팩터리 메서드 패턴을 구현한 것이다.

`Supplier<T>` 인터페이스가 팩터리를 표현한 완벽한 예다. <br>
일반적으로 한정적 **와일드카드 타입(bounded wildcard type)**을 사용해 팩터리의 타입 매개변수를 제한해야 한다.<br>
자신이 명시한 타입의 하위 타입이라면 무엇이든 생성할 수 있는 팩터리를 넘길 수 있다.<br>

```java
// 클라이언트가 제공한 팩터리가 생성한 타일들로 구성된 모자이크를 만드는 메서드
Mosaic create(Supplier<? extends Tile> tileFactory) { ... }
```

### 핵심 정리
클래스가 내부적으로 하나 이상의 자원에 의존하고, 그 자원이 클래스 동작에 영향을 준다면 싱글턴과 정적 유틸리티 클래스는 사용하지 않는 것이 좋다.<br>
이 자원들을 클래스가 직접 만들게 해서도 안 된다.<br> 
**대신 필요한 자원을(혹은 그 자원을 만들어주는 팩터리) 생성자에 넘겨주자.**
